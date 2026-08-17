/**
 * WhatsApp opt-out — reading and recording withdrawn consent.
 *
 * Meta's messaging policy requires a person to be able to stop
 * business-initiated messages with a stop word, and requires the business to
 * honour it. `parents.opted_out_at` is the record; the enforcement point is
 * sendSmartMessage (src/lib/whatsapp/sendSmart.ts) plus the payment-request
 * server actions, which are the only proactive sends that bypass it.
 *
 * Deliberately scoped to *business-initiated* messages: a parent who has opted
 * out and then writes to the bot still gets an answer. Silence in response to a
 * direct question is not what an opt-out means.
 *
 * The Deno mirror of the enforcement lives in
 * supabase/functions/_shared/whatsapp.ts — the cron reminders send from there.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * True when this phone belongs to a parent in this org who has opted out.
 *
 * Fails open: a DB error must not silently swallow a lesson reminder, so the
 * send proceeds and the failure is logged. The opposite default would turn a
 * transient outage into a silent messaging blackout.
 */
export async function isOptedOut(orgId: string, phone: string): Promise<boolean> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('parents')
    .select('opted_out_at')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (error) {
    console.warn('[optOut] lookup failed — allowing the send', { orgId, error: error.message })
    return false
  }

  return data?.opted_out_at != null
}

/**
 * Records or clears the opt-out for a parent.
 * Returns false when no parent matches the phone in this org.
 */
export async function setParentOptOut(
  orgId: string,
  phone: string,
  optedOut: boolean
): Promise<boolean> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('parents')
    .update({ opted_out_at: optedOut ? new Date().toISOString() : null })
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .select('id')

  if (error) {
    console.error('[optOut] failed to persist', { orgId, optedOut, error: error.message })
    return false
  }

  return (data?.length ?? 0) > 0
}
