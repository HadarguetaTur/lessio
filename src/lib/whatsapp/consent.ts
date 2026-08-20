/**
 * WhatsApp business-send gate — opt-out plus the one-time welcome notice.
 *
 * Every business-initiated message to a parent (reminders, payment requests,
 * receipts, teacher time-off notices, dashboard buttons) goes through
 * prepareBusinessSend() before the actual send:
 *
 *   1. Opt-out (parents.opted_out_at) → the send is refused.
 *   2. First contact (parents.welcome_sent_at IS NULL) → a welcome notice goes
 *      out first, explaining who is messaging, what about, and how to stop.
 *      Sent exactly once per parent; the claim is an atomic UPDATE so two crons
 *      racing on the same parent cannot both send it.
 *
 * Consent itself (consent_source / consented_at) is evidence, not a gate: a
 * parent with no consent record still gets messages, preceded by the notice.
 * Blocking would silently drop lesson reminders for every legacy and imported
 * parent, which is a worse outcome than one explanatory message.
 *
 * Direct replies to something the parent wrote are never gated — a question
 * deserves an answer, and an inbound message is itself opt-in (recorded by the
 * webhook as consent_source = 'whatsapp_reply').
 *
 * The Deno mirror lives in supabase/functions/_shared/whatsapp.ts — the cron
 * reminders send from there.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AppLocale } from '@/lib/i18n/locale'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { isOptedOut } from './optOut'
import { getApprovedTemplate } from './approvedTemplates'
import { sendTemplateMessage } from './index'

export type BusinessSendGate = { ok: true } | { ok: false; reason: 'opted_out' }

export type ConsentSource = 'attested' | 'import' | 'portal' | 'booking' | 'whatsapp_reply'

export async function prepareBusinessSend(params: {
  orgId: string
  phone: string
  accessToken: string
  phoneNumberId: string
  /** Recipient language. When omitted, the parent's stored locale / org default is used. */
  locale?: AppLocale
}): Promise<BusinessSendGate> {
  const { orgId, phone, accessToken, phoneNumberId } = params

  if (await isOptedOut(orgId, phone)) {
    return { ok: false, reason: 'opted_out' }
  }

  // Fail-open on anything unexpected: this gate sits in front of lesson
  // reminders, payment requests and a day-off approval. A welcome-notice
  // problem must cost at most the notice, never the message behind it.
  try {
    await sendWelcomeIfFirstContact({ orgId, phone, accessToken, phoneNumberId, locale: params.locale })
  } catch (err) {
    console.warn('[consent] welcome notice threw — continuing with the send', { orgId, error: String(err) })
  }

  return { ok: true }
}

/**
 * Claims and sends the welcome notice when this is the parent's first
 * business-initiated contact. Never throws: a failure here must not cost the
 * parent the message that triggered it.
 */
async function sendWelcomeIfFirstContact(params: {
  orgId: string
  phone: string
  accessToken: string
  phoneNumberId: string
  locale?: AppLocale
}): Promise<void> {
  const { orgId, phone, accessToken, phoneNumberId } = params
  const db = createServiceRoleClient()

  // Atomic claim: only the caller whose UPDATE actually flips NULL → now()
  // sends. A phone that is not a parent in this org (teacher, owner) matches
  // no row and gets no notice.
  const { data: claimed, error: claimError } = await db
    .from('parents')
    .update({ welcome_sent_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .is('welcome_sent_at', null)
    .select('id, preferred_locale')

  if (claimError) {
    console.warn('[consent] welcome claim failed — skipping the notice', { orgId, error: claimError.message })
    return
  }
  const parent = claimed?.[0]
  if (!parent) return

  try {
    const { data: org } = await db
      .from('organizations')
      .select('name, default_locale')
      .eq('id', orgId)
      .maybeSingle()

    const locale =
      params.locale ??
      resolveRecipientLocale({ stored: parent.preferred_locale, orgDefault: org?.default_locale })

    const approved = getApprovedTemplate('welcome_notice', locale) ?? getApprovedTemplate('welcome_notice', 'he')
    if (!approved) {
      throw new Error('welcome_notice has no approved template')
    }

    await sendTemplateMessage(
      phone,
      accessToken,
      phoneNumberId,
      approved.name,
      approved.languageCode,
      approved.buildComponents({ org_name: org?.name ?? '' })
    )
    console.info('[consent] welcome notice sent', { orgId, parentId: parent.id })
  } catch (err) {
    // Release the claim so the next business send tries again — most often the
    // template is still PENDING at Meta.
    console.warn('[consent] welcome notice failed — will retry on next send', {
      orgId,
      parentId: parent.id,
      error: String(err),
    })
    await db
      .from('parents')
      .update({ welcome_sent_at: null })
      .eq('id', parent.id)
      .then(({ error }) => {
        if (error) console.error('[consent] failed to release welcome claim', { parentId: parent.id, error: error.message })
      })
  }
}

/**
 * Records consent for a parent if none is on file yet. An existing record is
 * never overwritten — the first evidence is the one that counts.
 *
 * `markWelcomeSent` is for sources where the parent initiated contact
 * (whatsapp_reply): someone who wrote to us first does not need the notice.
 */
export async function recordParentConsent(params: {
  parentId: string
  source: ConsentSource
  consentedBy?: string | null
  markWelcomeSent?: boolean
}): Promise<void> {
  const now = new Date().toISOString()

  // Recording consent is bookkeeping: it runs inside portal login and booking
  // confirmation, where a failure must not cost the parent their session or
  // their lesson. Log and move on. The client is constructed inside the try
  // because it throws too when the service-role key is missing.
  try {
    const db = createServiceRoleClient()
    const { error } = await db
      .from('parents')
      .update({
        consent_source: params.source,
        consented_at: now,
        consented_by: params.consentedBy ?? null,
        ...(params.markWelcomeSent ? { welcome_sent_at: now } : {}),
      })
      .eq('id', params.parentId)
      .is('consented_at', null)

    if (error) {
      console.error('[consent] failed to record consent', { parentId: params.parentId, source: params.source, error: error.message })
    }
  } catch (err) {
    console.error('[consent] failed to record consent', { parentId: params.parentId, source: params.source, error: String(err) })
  }
}
