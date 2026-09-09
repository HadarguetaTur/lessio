/**
 * Unsubscribe means erased, not flagged.
 *
 * Someone who asks to be removed from a cold-email list is not a record to
 * keep tidy — the only thing we may still hold is the address itself, in
 * `outbound_suppressions`, and only so a future CSV cannot bring them back.
 * Everything else (name, company, phone, the conversation, the lead) is
 * deleted by the `erase_outbound_prospect` SQL function, in one transaction.
 *
 * Two doors lead here and both end in the same call: a reply the classifier
 * reads as `unsubscribe`, and the one-click link every outbound email now
 * carries (RFC 8058, so Gmail and Outlook show their own Unsubscribe button).
 */

import { randomBytes } from 'node:crypto'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import type { OutboundLocale } from './types'

/** 128 bits: unguessable, and the row is gone the moment it is used. */
export function newUnsubscribeToken(): string {
  return randomBytes(16).toString('hex')
}

export function isUnsubscribeToken(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value)
}

export function unsubscribeUrl(token: string): string {
  return `${getShareableBaseUrl()}/u/${token}`
}

/**
 * RFC 8058. `List-Unsubscribe-Post` is what turns the mail client's own
 * button into a single POST — without it Gmail only offers the link.
 */
export function unsubscribeHeaders(token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl(token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

export function unsubscribeFooter(
  url: string,
  locale: OutboundLocale
): { text: string; html: string } {
  if (locale === 'en') {
    return {
      text: `Not relevant? One click and I am out of your inbox: ${url}`,
      html: `<p style="margin:24px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">Not relevant? <a href="${url}" style="color:#9ca3af;">One click and I am out of your inbox</a>.</p>`,
    }
  }
  return {
    text: `לא רלוונטי? בלחיצה אחת אני יורדת מהתיבה שלך: ${url}`,
    html: `<p style="margin:24px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">לא רלוונטי? <a href="${url}" style="color:#9ca3af;">בלחיצה אחת אני יורדת מהתיבה שלך</a>.</p>`,
  }
}

export interface EraseResult {
  email: string
  leads: number
  messages: number
  prospects: number
}

export async function eraseProspectByEmail(email: string, source: string): Promise<EraseResult> {
  const db = createServiceRoleClient()
  const { data, error } = await db.rpc('erase_outbound_prospect', {
    p_email: email,
    p_source: source.slice(0, 200),
  })
  if (error) throw new Error(`[outbound/unsubscribe] erase failed: ${error.message}`)
  return data as EraseResult
}

/**
 * `gone` covers every "nothing to do" case — a malformed token, a token that
 * was already used, one that never existed. The caller shows the same page
 * either way, so a stranger cannot probe which tokens are real.
 */
export async function unsubscribeByToken(
  token: string,
  source: 'link' | 'one_click'
): Promise<'erased' | 'gone'> {
  if (!isUnsubscribeToken(token)) return 'gone'

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('outbound_prospects')
    .select('email')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  if (error) throw new Error(`[outbound/unsubscribe] token lookup failed: ${error.message}`)
  if (!data?.email) return 'gone'

  await eraseProspectByEmail(data.email as string, `unsubscribe:${source}`)
  return 'erased'
}
