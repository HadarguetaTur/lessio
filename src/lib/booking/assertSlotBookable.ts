/**
 * The authoritative write-time answer to "may this slot be booked?".
 *
 * Rendered availability is advisory. Every list of slots a parent sees was
 * computed at render time from data that can change a second later — the
 * teacher edits the weekly grid, the org adds a holiday, the owner narrows the
 * allowed durations — and the page has no idea. A stale page must never be able
 * to persist an invalid lesson, so the same questions are asked again here,
 * immediately before the row is written.
 *
 * Called from BOTH ends of the parent booking flow:
 *   - createSlotLock, so a stale slot cannot even be reserved
 *   - confirmBooking, so a lock taken five minutes ago cannot outlive the
 *     conditions that justified it
 *
 * What it checks, and why each one was reachable before:
 *   past                 the client sends startAt/endAt; nothing rejected a
 *                        timestamp already behind us
 *   min_notice           enforced only by the slot generator's horizon
 *   duration_not_allowed the actions gate the *requested* duration, not the
 *                        start/end pair actually posted
 *   holiday              re-checked at confirm but not at lock
 *   outside_availability the one this closes outright: the old write path
 *                        checked only availability *blocks*, never "is this
 *                        inside an open window" — so a weekday the teacher had
 *                        removed from the grid stayed bookable from a stale page
 *
 * Times are compared as org-local wall clock strings, never instants, for the
 * same reason resolveDayWindows does: a weekly rule has no instant, and routing
 * it through a Date shifts it across a DST boundary.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveDayWindows } from '@/lib/availability/resolveDayWindows'
import {
  isLessonDurationAllowed,
  type LessonDurationAudience,
} from '@/lib/organizations/lessonDurations'

export type SlotRejectionReason =
  | 'invalid_range'
  | 'past'
  | 'min_notice'
  | 'duration_not_allowed'
  | 'holiday'
  | 'outside_availability'
  /**
   * A question we could not ask. supabase-js returns `{ error }` instead of
   * throwing, so a discarded error used to be indistinguishable from a clean
   * "nothing found" — and "nothing found" reads as permission on every check
   * below. An unanswerable question is a refusal, not an allowance.
   */
  | 'unavailable'

export class SlotNotBookableError extends Error {
  readonly reason: SlotRejectionReason

  constructor(reason: SlotRejectionReason) {
    super(`Slot is not bookable: ${reason}`)
    this.name = 'SlotNotBookableError'
    this.reason = reason
  }
}

export interface AssertSlotBookableParams {
  orgId: string
  teacherId: string
  /** UTC ISO */
  startUtc: string
  /** UTC ISO */
  endUtc: string
  /** Whose duration whitelist applies. Parent surfaces are always 'bot'. */
  audience: LessonDurationAudience
  /**
   * `min_booking_notice_hours` is a rule about how late a PARENT may book, not
   * about when the studio may put a lesson in its own diary. Staff paths pass
   * true so the notice window stops applying to them — every other check here
   * (holiday, open availability window, duration whitelist, past) still does.
   *
   * Nothing else may be opted out of: the point of this function is that a
   * caller cannot pick which of the questions it feels like answering.
   */
  skipMinNotice?: boolean
  /** Injected by tests; defaults to now. */
  now?: DateTime
}

export async function assertSlotBookable(params: AssertSlotBookableParams): Promise<void> {
  const { orgId, teacherId, startUtc, endUtc, audience } = params
  const db = createServiceRoleClient()

  const start = DateTime.fromISO(startUtc, { zone: 'utc' })
  const end = DateTime.fromISO(endUtc, { zone: 'utc' })
  if (!start.isValid || !end.isValid || end <= start) {
    throw new SlotNotBookableError('invalid_range')
  }

  const now = params.now ?? DateTime.utc()

  // 1. A booking in the past is never a race — it is a forged or stale payload.
  if (start <= now) throw new SlotNotBookableError('past')

  // supabase-js returns `{ error }` rather than throwing. On this path an
  // unread org row would silently fall back to a 0-hour notice window and the
  // default timezone — a permissive answer derived from a failure.
  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('timezone, min_booking_notice_hours')
    .eq('id', orgId)
    .single()
  if (orgError || !org) throw new SlotNotBookableError('unavailable')

  const timezone = (org?.timezone as string | null) ?? 'Asia/Jerusalem'
  const noticeHours = Number(org?.min_booking_notice_hours ?? 0) || 0

  // 2. Minimum notice, expressed exactly as the slot generator expresses it
  // (`slotEnd > now + notice`), so a slot that was legitimately offered can
  // never be refused here for a rounding difference.
  if (!params.skipMinNotice && noticeHours > 0 && end <= now.plus({ hours: noticeHours })) {
    throw new SlotNotBookableError('min_notice')
  }

  // 3. Duration whitelist. The actions check the duration the client *asked*
  // for; this checks the one the start/end pair actually encodes.
  const durationMinutes = end.diff(start, 'minutes').minutes
  if (!Number.isInteger(durationMinutes)) throw new SlotNotBookableError('duration_not_allowed')
  if (!(await isLessonDurationAllowed(orgId, audience, durationMinutes))) {
    throw new SlotNotBookableError('duration_not_allowed')
  }

  const startLocal = start.setZone(timezone)
  const endLocal = end.setZone(timezone)
  const date = startLocal.toISODate()!

  // 4. Org-wide holiday.
  const { data: holiday, error: holidayError } = await db
    .from('organization_holidays')
    .select('id')
    .eq('organization_id', orgId)
    .eq('date', date)
    .limit(1)
    .maybeSingle()
  if (holidayError) throw new SlotNotBookableError('unavailable')
  if (holiday) throw new SlotNotBookableError('holiday')

  // 5. Inside an OPEN availability window. resolveDayWindows has already
  // subtracted every blocked range from the base windows, so containment here
  // answers "open" and "not blocked" in one question — a whole-day block leaves
  // no windows at all.
  const day = await resolveDayWindows({ orgId, teacherId, date, timezone })
  const startClock = startLocal.toFormat('HH:mm')
  // A slot ending exactly at midnight belongs to this date's evening, not the
  // next date's "00:00" — express it as the end of this day's clock. Anything
  // that runs further than that spans two days and no single window holds it.
  const endClock = endLocal.toISODate() === date ? endLocal.toFormat('HH:mm') : '24:00'

  const inside = day.windows.some((w) => startClock >= w.start && endClock <= w.end)
  if (!inside) throw new SlotNotBookableError('outside_availability')
}
