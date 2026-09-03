/**
 * Human takeover of a WhatsApp conversation.
 *
 * When a staff member answers a parent by hand, the bot must stop replying —
 * otherwise the parent gets two answers to one message, one of them written by
 * a person and one by a menu. Sending from the dashboard opens a takeover; it
 * lapses on its own after TAKEOVER_DURATION_HOURS, or the staff member hands
 * the conversation back explicitly.
 *
 * Same lifecycle as cancellation_sessions / support_sessions: the row's
 * presence is the state, expiry is checked at read time (no cleanup cron), and
 * release is a delete.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Long enough to cover a back-and-forth that pauses while the parent is at
 * work, short enough that a conversation someone forgot about returns to the
 * bot the same day rather than going quiet indefinitely.
 */
export const TAKEOVER_DURATION_HOURS = 6

export type Takeover = {
  phone: string
  takenByProfileId: string | null
  expiresAt: string
}

/**
 * True while a person is handling this conversation.
 *
 * Fails OPEN: if the lookup errors we let the bot answer. A parent hearing from
 * the bot when a human meant to reply is a duplicate message; a parent hearing
 * nothing because a query failed is a broken business number.
 */
export async function isTakenOver(orgId: string, phone: string): Promise<boolean> {
  return (await getTakeover(orgId, phone)) !== null
}

/** The live takeover for a conversation, or null. Expired rows are cleaned up here. */
export async function getTakeover(orgId: string, phone: string): Promise<Takeover | null> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('whatsapp_takeovers')
    .select('phone, taken_by_profile_id, expires_at')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (error) {
    console.warn('[whatsapp/takeover] lookup failed — treating as not taken over', {
      orgId,
      error: error.message,
    })
    return null
  }

  if (!data) return null

  const row = data as { phone: string; taken_by_profile_id: string | null; expires_at: string }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    // Opportunistic cleanup, exactly as getActiveCancellationSession does.
    await db
      .from('whatsapp_takeovers')
      .delete()
      .eq('organization_id', orgId)
      .eq('phone', phone)
    return null
  }

  return {
    phone: row.phone,
    takenByProfileId: row.taken_by_profile_id,
    expiresAt: row.expires_at,
  }
}

/**
 * Opens or extends a takeover. Every staff message restarts the clock, so an
 * active conversation stays with the person handling it.
 */
export async function setTakeover(
  orgId: string,
  phone: string,
  profileId: string
): Promise<void> {
  const db = createServiceRoleClient()
  const expiresAt = new Date(Date.now() + TAKEOVER_DURATION_HOURS * 60 * 60 * 1000).toISOString()

  const { error } = await db
    .from('whatsapp_takeovers')
    .upsert(
      {
        organization_id: orgId,
        phone,
        taken_by_profile_id: profileId,
        expires_at: expiresAt,
      },
      { onConflict: 'organization_id,phone' }
    )

  if (error) {
    console.error('[whatsapp/takeover] failed to open takeover', { orgId, error: error.message })
  }
}

/** Hands the conversation back to the bot. */
export async function releaseTakeover(orgId: string, phone: string): Promise<void> {
  const db = createServiceRoleClient()

  const { error } = await db
    .from('whatsapp_takeovers')
    .delete()
    .eq('organization_id', orgId)
    .eq('phone', phone)

  if (error) {
    console.error('[whatsapp/takeover] failed to release takeover', { orgId, error: error.message })
  }
}

/** Live takeovers for a whole org, keyed by phone — for the conversation list. */
export async function getActiveTakeovers(orgId: string): Promise<Map<string, Takeover>> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('whatsapp_takeovers')
    .select('phone, taken_by_profile_id, expires_at')
    .eq('organization_id', orgId)
    .gt('expires_at', new Date().toISOString())

  if (error) {
    console.warn('[whatsapp/takeover] list failed', { orgId, error: error.message })
    return new Map()
  }

  const rows = (data ?? []) as {
    phone: string
    taken_by_profile_id: string | null
    expires_at: string
  }[]

  return new Map(
    rows.map((row) => [
      row.phone,
      { phone: row.phone, takenByProfileId: row.taken_by_profile_id, expiresAt: row.expires_at },
    ])
  )
}
