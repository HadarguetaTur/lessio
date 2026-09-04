/**
 * Copilot action-session state — the server-side half of every copilot
 * confirmation.
 *
 * Modelled on src/lib/support/supportSessions.ts (one live row per (org,
 * phone), expiry checked at read time), with two deliberate differences:
 *
 * 1. Rows are never deleted. A session that reached 'executed' is the audit
 *    trail — who confirmed what, when, and what happened. Superseded and
 *    cancelled proposals are closed by status, not removed.
 * 2. Execution goes through a guarded claim (the day-off `claimRequest`
 *    pattern): the UPDATE that flips 'awaiting_confirm' → 'executed' is the
 *    lock, so a double-tapped confirm button runs the action exactly once.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AppLocale } from '@/lib/i18n/locale'

/** Ten minutes, matching the other webhook session flows (decisions.md #14). */
const SESSION_TIMEOUT_MINUTES = 10

export type CopilotSessionStatus =
  | 'collecting'
  | 'awaiting_confirm'
  | 'executed'
  | 'cancelled'
  | 'expired'

const LIVE_STATUSES: readonly CopilotSessionStatus[] = ['collecting', 'awaiting_confirm']

export interface CopilotSession {
  id: string
  organization_id: string
  phone: string
  actor_profile_id: string
  action: string
  params: Record<string, unknown>
  status: CopilotSessionStatus
  locale: AppLocale
  result: Record<string, unknown> | null
  expires_at: string
}

const SESSION_COLUMNS =
  'id, organization_id, phone, actor_profile_id, action, params, status, locale, result, expires_at'

function expiryFromNow(): string {
  return new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()
}

/**
 * Opens a new proposal, superseding any live one for this phone. The partial
 * unique index allows only one live row per (org, phone), so the old proposal
 * is closed first — as 'cancelled', because a proposal replaced before its
 * confirm tap is exactly a proposal the user walked away from.
 */
export async function createCopilotSession(params: {
  orgId: string
  phone: string
  actorProfileId: string
  action: string
  sessionParams: Record<string, unknown>
  status: Extract<CopilotSessionStatus, 'collecting' | 'awaiting_confirm'>
  locale: AppLocale
}): Promise<string> {
  const db = createServiceRoleClient()

  await supersedeLiveCopilotSessions(params.orgId, params.phone)

  const { data, error } = await db
    .from('copilot_sessions')
    .insert({
      organization_id: params.orgId,
      phone: params.phone,
      actor_profile_id: params.actorProfileId,
      action: params.action,
      params: params.sessionParams,
      status: params.status,
      locale: params.locale,
      expires_at: expiryFromNow(),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`[copilot/sessions] Failed to create session: ${error?.message}`)
  }
  return (data as { id: string }).id
}

/**
 * Closes any live proposal for this phone without replacing it. Logs rather
 * than throws: on the create path a missed supersede surfaces anyway as the
 * insert hitting the partial unique index, and on the menu-tap path a session
 * cleanup must never break the menu.
 */
export async function supersedeLiveCopilotSessions(orgId: string, phone: string): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('copilot_sessions')
    .update({ status: 'cancelled' })
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .in('status', [...LIVE_STATUSES])

  if (error) {
    console.error('[copilot/sessions] Failed to supersede sessions', {
      orgId,
      error: error.message,
    })
  }
}

/** The live (non-expired collecting/awaiting_confirm) session, or null. */
export async function getLiveCopilotSession(
  orgId: string,
  phone: string
): Promise<CopilotSession | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('copilot_sessions')
    .select(SESSION_COLUMNS)
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .in('status', [...LIVE_STATUSES])
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as CopilotSession
}

/**
 * A session by the id a button carried. Scoped to (org, phone): the id is
 * client-supplied, so a tap forwarded to another chat, or crafted, must find
 * nothing rather than someone else's proposal.
 */
export async function getCopilotSessionById(
  sessionId: string,
  orgId: string,
  phone: string
): Promise<CopilotSession | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('copilot_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as CopilotSession
}

/** Merges collected params and moves the session to the confirm step. */
export async function markCopilotSessionAwaitingConfirm(
  sessionId: string,
  orgId: string,
  sessionParams: Record<string, unknown>
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('copilot_sessions')
    .update({ params: sessionParams, status: 'awaiting_confirm', expires_at: expiryFromNow() })
    .eq('id', sessionId)
    .eq('organization_id', orgId)
    .in('status', [...LIVE_STATUSES])

  if (error) {
    throw new Error(`[copilot/sessions] Failed to update session: ${error.message}`)
  }
}

/**
 * Claims the session for execution. The UPDATE's WHERE is the lock: only a
 * live, unexpired 'awaiting_confirm' row can flip to 'executed', and only one
 * caller wins. Returns the claimed row, or null when someone (or a second tap)
 * got there first — the caller replies "already done" instead of re-running.
 */
export async function claimCopilotSession(
  sessionId: string,
  orgId: string,
  phone: string
): Promise<CopilotSession | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('copilot_sessions')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .eq('status', 'awaiting_confirm')
    .gt('expires_at', new Date().toISOString())
    .select(SESSION_COLUMNS)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as CopilotSession
}

/** Marks a live session cancelled (the explicit cancel tap). */
export async function cancelCopilotSession(
  sessionId: string,
  orgId: string,
  phone: string
): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('copilot_sessions')
    .update({ status: 'cancelled' })
    .eq('id', sessionId)
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .in('status', [...LIVE_STATUSES])
    .select('id')
    .maybeSingle()

  return !error && !!data
}

/**
 * Records what execution actually did, for the audit row. Fire-and-forget
 * semantics at call sites — a failed result write must not fail the reply.
 */
export async function setCopilotSessionResult(
  sessionId: string,
  orgId: string,
  result: Record<string, unknown>
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('copilot_sessions')
    .update({ result })
    .eq('id', sessionId)
    .eq('organization_id', orgId)

  if (error) {
    console.error('[copilot/sessions] Failed to record result', { sessionId, error: error.message })
  }
}
