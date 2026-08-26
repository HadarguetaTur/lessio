/**
 * WhatsApp support-request session state — Sprint 32 M2.
 *
 * Modelled on src/lib/cancellation-flow's session helpers: one row per
 * (org, phone), expiry checked at read time, deleted by any higher-priority
 * event. The difference is the explicit `step` — this flow is three turns
 * (tap → describe → confirm), so the row's existence alone cannot say where
 * the conversation is.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Ten minutes, matching the cancellation flow (docs/decisions.md #14). Long
 * enough to type a paragraph about a bug, short enough that a forgotten session
 * does not swallow an unrelated message an hour later.
 */
const SESSION_TIMEOUT_MINUTES = 10

export type SupportStep = 'awaiting_description' | 'awaiting_confirm'

export interface SupportSession {
  id: string
  organization_id: string
  phone: string
  step: SupportStep
  draft_text: string | null
  expires_at: string
}

/** Starts (or restarts) a support request. A second tap replaces the first. */
export async function startSupportSession(orgId: string, phone: string): Promise<void> {
  const db = createServiceRoleClient()
  const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()

  const { error } = await db.from('support_sessions').upsert(
    {
      organization_id: orgId,
      phone,
      step: 'awaiting_description',
      draft_text: null,
      expires_at: expiresAt,
    },
    { onConflict: 'organization_id,phone' }
  )

  if (error) {
    throw new Error(`[support/sessions] Failed to start session: ${error.message}`)
  }
}

/**
 * Records what they typed and moves to the confirmation step.
 *
 * The expiry is extended here, not left as-is: the clock should measure how
 * long they have been idle, not how long ago they opened the request.
 */
export async function setSupportDraft(
  orgId: string,
  phone: string,
  draftText: string
): Promise<void> {
  const db = createServiceRoleClient()
  const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()

  const { error } = await db
    .from('support_sessions')
    .update({ step: 'awaiting_confirm', draft_text: draftText, expires_at: expiresAt })
    .eq('organization_id', orgId)
    .eq('phone', phone)

  if (error) {
    throw new Error(`[support/sessions] Failed to save draft: ${error.message}`)
  }
}

/** The active (non-expired) session for this phone, or null. */
export async function getActiveSupportSession(
  orgId: string,
  phone: string
): Promise<SupportSession | null> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('support_sessions')
    .select('id, organization_id, phone, step, draft_text, expires_at')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) return null
  return data as SupportSession
}

/** Ends the session — on submission, cancel, or any higher-priority event. */
export async function deleteSupportSession(orgId: string, phone: string): Promise<void> {
  const db = createServiceRoleClient()
  await db.from('support_sessions').delete().eq('organization_id', orgId).eq('phone', phone)
}
