/**
 * The mailbox pool: which Workspace address sends the next cold email.
 *
 * Several outreach mailboxes share the load. Each has a daily cap counted in
 * Asia/Jerusalem days; the one with the most room today goes first, so the
 * pool drains evenly and no single address looks like a bulk sender. The
 * send window (Sun–Thu, 08:00–18:00 Israel time) is enforced here as well as
 * in the cron schedule, so a UTC/DST drift never sends at midnight.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const OUTBOUND_TIMEZONE = 'Asia/Jerusalem'
export const SEND_WINDOW = { startHour: 8, endHour: 18, weekdays: [7, 1, 2, 3, 4] } as const // Luxon: 7 = Sunday

export interface Mailbox {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  daily_cap: number
  last_history_id: string | null
  last_polled_at: string | null
  last_error: string | null
  last_error_at: string | null
  created_at: string
  updated_at: string
}

export interface MailboxWithUsage extends Mailbox {
  sentToday: number
}

// ── Pure ────────────────────────────────────────────────────────────────────

export function isInSendWindow(now: Date, tz: string = OUTBOUND_TIMEZONE): boolean {
  const local = DateTime.fromJSDate(now).setZone(tz)
  if (!(SEND_WINDOW.weekdays as readonly number[]).includes(local.weekday)) return false
  return local.hour >= SEND_WINDOW.startHour && local.hour < SEND_WINDOW.endHour
}

/**
 * When sending next resumes, or null if it is running right now. Walks forward
 * hour by hour at most a week, so a Thursday evening answers "Sunday 08:00"
 * and a Sunday 07:00 answers "today 08:00".
 */
export function nextSendWindowStart(now: Date, tz: string = OUTBOUND_TIMEZONE): Date | null {
  if (isInSendWindow(now, tz)) return null
  const local = DateTime.fromJSDate(now).setZone(tz)
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = local.plus({ days: dayOffset }).set({ hour: SEND_WINDOW.startHour, minute: 0, second: 0, millisecond: 0 })
    if (candidate <= local) continue
    if ((SEND_WINDOW.weekdays as readonly number[]).includes(candidate.weekday)) return candidate.toJSDate()
  }
  return null
}

/** Start of the current local day, as an ISO instant — the cap's reset point. */
export function startOfLocalDay(now: Date, tz: string = OUTBOUND_TIMEZONE): string {
  return DateTime.fromJSDate(now).setZone(tz).startOf('day').toUTC().toISO()!
}

/**
 * The mailbox to send from next: active, under its cap, most headroom first;
 * ties broken by the older last error (a freshly failing box waits its turn).
 */
export function pickMailbox(boxes: MailboxWithUsage[]): MailboxWithUsage | null {
  const eligible = boxes.filter((b) => b.is_active && b.sentToday < b.daily_cap)
  if (eligible.length === 0) return null
  eligible.sort((a, b) => {
    const room = b.daily_cap - b.sentToday - (a.daily_cap - a.sentToday)
    if (room !== 0) return room
    return (a.last_error_at ?? '').localeCompare(b.last_error_at ?? '')
  })
  return eligible[0]!
}

/** How many sends the whole pool still has today. */
export function remainingCapacity(boxes: MailboxWithUsage[]): number {
  return boxes
    .filter((b) => b.is_active)
    .reduce((sum, b) => sum + Math.max(0, b.daily_cap - b.sentToday), 0)
}

// ── DB ──────────────────────────────────────────────────────────────────────

export async function listMailboxes(): Promise<Mailbox[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db.from('outbound_mailboxes').select('*').order('created_at', { ascending: true })
  if (error) throw new Error(`[outbound/mailboxes] list failed: ${error.message}`)
  return (data ?? []) as Mailbox[]
}

export async function listMailboxesWithUsage(now: Date = new Date()): Promise<MailboxWithUsage[]> {
  const db = createServiceRoleClient()
  const boxes = await listMailboxes()
  if (boxes.length === 0) return []

  const since = startOfLocalDay(now)
  const { data, error } = await db
    .from('outbound_messages')
    .select('mailbox_id')
    .eq('direction', 'out')
    .eq('transport', 'gmail')
    .is('error', null)
    .gte('created_at', since)
    .not('mailbox_id', 'is', null)
  if (error) throw new Error(`[outbound/mailboxes] usage failed: ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const id = row.mailbox_id as string
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return boxes.map((b) => ({ ...b, sentToday: counts.get(b.id) ?? 0 }))
}

export type SaveMailboxResult = { ok: true; id: string } | { ok: false; error: 'INVALID_EMAIL' | 'DUPLICATE' | 'SAVE_FAILED' }

export async function saveMailbox(input: {
  id?: string
  email: string
  displayName: string | null
  dailyCap: number
  isActive: boolean
}): Promise<SaveMailboxResult> {
  const db = createServiceRoleClient()
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'INVALID_EMAIL' }

  const row = { email, display_name: input.displayName, daily_cap: input.dailyCap, is_active: input.isActive }
  const query = input.id
    ? db.from('outbound_mailboxes').update(row).eq('id', input.id).select('id').single()
    : db.from('outbound_mailboxes').insert(row).select('id').single()
  const { data, error } = await query
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'DUPLICATE' }
    console.error('[outbound/mailboxes] save failed', error)
    return { ok: false, error: 'SAVE_FAILED' }
  }
  return { ok: true, id: data.id as string }
}

export async function markMailboxError(id: string, error: string | null, at: Date = new Date()): Promise<void> {
  const db = createServiceRoleClient()
  await db
    .from('outbound_mailboxes')
    .update(error ? { last_error: error.slice(0, 500), last_error_at: at.toISOString() } : { last_error: null, last_error_at: null })
    .eq('id', id)
}

export async function markMailboxPolled(id: string, at: Date): Promise<void> {
  const db = createServiceRoleClient()
  await db.from('outbound_mailboxes').update({ last_polled_at: at.toISOString(), last_error: null, last_error_at: null }).eq('id', id)
}
