/**
 * Global do-not-email list.
 *
 * Adding an address is a promise: it will never be mailed again by any
 * campaign. So the add also pulls any not-yet-sent prospect with that address
 * out of the queue — the claim SQL checks the list too, but a row that reads
 * `suppressed` on the dashboard is worth the extra update.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SuppressionReason } from './types'

export interface Suppression {
  id: string
  email: string
  reason: SuppressionReason
  source: string | null
  created_at: string
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function addSuppression(input: {
  email: string
  reason: SuppressionReason
  source: string
}): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const db = createServiceRoleClient()
  const email = normalizeEmail(input.email)
  if (!email.includes('@')) return { ok: false, error: 'INVALID_EMAIL' }

  const { data, error } = await db
    .from('outbound_suppressions')
    .upsert({ email, reason: input.reason, source: input.source }, { onConflict: 'email', ignoreDuplicates: true })
    .select('id')
  if (error) {
    console.error('[outbound/suppressions] upsert failed', { email, error: error.message })
    return { ok: false, error: 'SAVE_FAILED' }
  }

  // Not-yet-sent prospects leave the queue. Sent ones keep their history —
  // the list already prevents any further send.
  await db
    .from('outbound_prospects')
    .update({ status: 'suppressed' })
    .eq('email', email)
    .in('status', ['queued', 'claimed'])

  return { ok: true, created: (data ?? []).length > 0 }
}

export async function listSuppressions(limit = 200): Promise<Suppression[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('outbound_suppressions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[outbound/suppressions] list failed: ${error.message}`)
  return (data ?? []) as Suppression[]
}

/** Which of `emails` are suppressed. */
export async function findSuppressed(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set()
  const db = createServiceRoleClient()
  const found = new Set<string>()
  for (let i = 0; i < emails.length; i += 500) {
    const chunk = emails.slice(i, i + 500)
    const { data, error } = await db.from('outbound_suppressions').select('email').in('email', chunk)
    if (error) throw new Error(`[outbound/suppressions] lookup failed: ${error.message}`)
    for (const row of data ?? []) found.add(row.email as string)
  }
  return found
}

/** True when this address asked out, or bounced, or was blocked by hand. */
export async function isSuppressed(email: string): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('outbound_suppressions')
    .select('email')
    .eq('email', normalizeEmail(email))
    .maybeSingle()
  if (error) throw new Error(`[outbound/suppressions] lookup failed: ${error.message}`)
  return Boolean(data)
}

/**
 * Silence one prospect by hand, whatever state the conversation is in.
 *
 * `addSuppression` alone only pulls not-yet-sent rows out of the queue; a
 * prospect who was already mailed keeps their status so the history stays
 * readable. Here the founder is explicitly closing the door on a person, so
 * the follow-ups stop too. Terminal rows (unsubscribed, bounced, converted)
 * are left as they are.
 */
export async function suppressProspect(
  prospectId: string,
  source: string
): Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' | 'SAVE_FAILED' }> {
  const db = createServiceRoleClient()
  const { data: prospect } = await db
    .from('outbound_prospects')
    .select('email, status')
    .eq('id', prospectId)
    .maybeSingle()
  if (!prospect) return { ok: false, error: 'NOT_FOUND' }

  const added = await addSuppression({ email: prospect.email as string, reason: 'manual', source })
  if (!added.ok) return { ok: false, error: 'SAVE_FAILED' }

  const terminal = ['unsubscribed', 'bounced', 'converted']
  await db
    .from('outbound_prospects')
    .update({
      next_followup_at: null,
      followup_claimed_at: null,
      ...(terminal.includes(prospect.status as string) ? {} : { status: 'suppressed' }),
    })
    .eq('id', prospectId)
  return { ok: true }
}
