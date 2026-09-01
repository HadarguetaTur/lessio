/**
 * getAvailableSlots — availability retrieval engine.
 * Per /docs/sprint-1-scope.md § EPIC 2 and /docs/decisions.md #1, #2, #6.
 *
 * All datetimes are stored as UTC in the DB.
 * The `date` parameter is a local date string (YYYY-MM-DD) in the org's timezone.
 * Slot start/end times are returned as UTC ISO strings.
 *
 * Slot formula (decisions.md #2):
 *   next_slot_start = current_slot_start + lesson_duration + break
 *
 * This function serves the PARENT-FACING booking surfaces only — the WebView at
 * /book/[token] and the portal, which is also where the WhatsApp bot's link
 * lands. Nothing on the dashboard calls it; teachers and admins create lessons
 * through createLesson, which checks conflicts but not availability. That is
 * what lets the break be enforced here without a flag: a parent may never be
 * offered a slot that leaves the teacher no gap, while the teacher remains free
 * to book back-to-back by hand.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveBreakMinutes } from '@/lib/scheduling/breaks'
import { getWeeklyQuotaStatus } from './weeklyQuota'

export interface AvailableSlot {
  startAt: string // UTC ISO string
  endAt: string   // UTC ISO string
}

export interface GetAvailableSlotsParams {
  teacherId: string
  date: string         // YYYY-MM-DD in org timezone
  durationMinutes: number
  organizationId: string
  /** When given, days in a week the student has already filled come back empty. */
  studentId?: string
}

export async function getAvailableSlots({
  teacherId,
  date,
  durationMinutes,
  organizationId,
  studentId,
}: GetAvailableSlotsParams): Promise<AvailableSlot[]> {
  const db = createServiceRoleClient()

  // 1. Load organization settings (timezone, break duration, min notice)
  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('timezone, break_duration_minutes, min_booking_notice_hours')
    .eq('id', organizationId)
    .single()

  if (orgError || !org) throw new Error(`Organization not found: ${organizationId}`)

  const { timezone, break_duration_minutes, min_booking_notice_hours } = org

  // 1b. The teacher may need a different break than the business default.
  // NULL inherits; an explicit 0 is a teacher who teaches back-to-back.
  const { data: teacherRow } = await db
    .from('teachers')
    .select('break_duration_minutes')
    .eq('id', teacherId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  const breakMinutes = resolveBreakMinutes(
    break_duration_minutes ?? 0,
    (teacherRow?.break_duration_minutes as number | null) ?? null
  )

  // 2. Determine day_of_week for the requested date in org timezone (0=Sunday)
  const localDate = DateTime.fromISO(date, { zone: timezone })
  if (!localDate.isValid) throw new Error(`Invalid date: ${date}`)
  const dayOfWeek = localDate.weekday % 7 // luxon: 1=Mon…7=Sun → 0=Sun, 1=Mon…6=Sat

  // 2b. Weekly quota — a filled week offers nothing on any of its days.
  if (studentId) {
    const { atQuota } = await getWeeklyQuotaStatus({
      studentId,
      organizationId,
      slotStartUtc: localDate.startOf('day').toUTC().toISO()!,
      timezone,
    })
    if (atQuota) return []
  }

  // 3. Check if requested date is an org-wide holiday — if so, no slots
  const { data: holiday, error: holidayError } = await db
    .from('organization_holidays')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('date', date)
    .limit(1)
    .maybeSingle()

  if (holidayError) throw new Error(`Failed to load holidays: ${holidayError.message}`)
  if (holiday) return []

  // 4. Date-specific overrides. Several rows per date are legal — a morning and
  // an evening can be blocked separately — so this is a list read, not
  // maybeSingle(). The old .limit(1) silently picked an arbitrary row.
  const { data: overrideRows, error: overrideError } = await db
    .from('availability_overrides')
    .select('is_available, start_time, end_time')
    .eq('teacher_id', teacherId)
    .eq('organization_id', organizationId)
    .eq('override_date', date)

  if (overrideError) throw new Error(`Failed to load availability override: ${overrideError.message}`)

  const overrides = overrideRows ?? []

  // A whole-day block (no times) closes the date outright.
  if (overrides.some(o => !o.is_available && !o.start_time)) return []

  // 5. Determine the availability windows for this day.
  // A teacher may have multiple recurring windows per weekday (e.g. morning + evening),
  // so this must NOT use maybeSingle() — with 2+ rows it errors and the day would
  // silently come back empty.
  const specialHours = overrides.filter(o => o.is_available && o.start_time && o.end_time)
  let windows: { start: string; end: string }[]

  if (specialHours.length > 0) {
    // Special hours for this date replace the weekly grid entirely.
    windows = specialHours.map(o => ({ start: o.start_time!, end: o.end_time! }))
  } else {
    // Fall back to recurring weekly availability
    const { data: weekly, error: weeklyError } = await db
      .from('availability')
      .select('start_time, end_time')
      .eq('teacher_id', teacherId)
      .eq('day_of_week', dayOfWeek)
      .order('start_time')

    if (weeklyError) throw new Error(`Failed to load weekly availability: ${weeklyError.message}`)
    windows = (weekly ?? []).map(w => ({ start: w.start_time, end: w.end_time }))
  }

  if (windows.length === 0) return [] // No availability defined for this day

  // Ranged blocks subtract from whatever the windows turned out to be. They
  // join the same blockedIntervals list as lessons and slot locks below, so the
  // slot loop needs no change at all.
  const rangedBlocks = overrides
    .filter(o => !o.is_available && o.start_time && o.end_time)
    .map(o => ({
      start: DateTime.fromISO(`${date}T${o.start_time}`, { zone: timezone }).toUTC(),
      end: DateTime.fromISO(`${date}T${o.end_time}`, { zone: timezone }).toUTC(),
    }))

  // 6. Load existing lessons for this teacher on this date (scheduled only)
  const dayStartUtc = localDate.startOf('day').toUTC().toISO()!
  const dayEndUtc = localDate.endOf('day').toUTC().toISO()!

  const { data: lessons } = await db
    .from('lessons')
    .select('start_at, end_at')
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .gte('start_at', dayStartUtc)
    .lte('start_at', dayEndUtc)

  // 7. Load active (non-expired) slot locks for this teacher on this date
  const { data: locks } = await db
    .from('slot_locks')
    .select('start_at, end_at')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .gte('start_at', dayStartUtc)
    .lte('start_at', dayEndUtc)

  // Lessons and locks are widened by the break on both sides, which is what
  // makes the break a real gap rather than only a slot stride: without this,
  // the overlap test below (strict inequalities) happily offers a slot starting
  // the instant a lesson ends.
  //
  // Ranged blocks are NOT widened. A block and a window edge say when the
  // teacher is *not there*, not when they are busy — there is no lesson to
  // recover from, so demanding a gap before they arrive would just shrink the
  // day. Keeping them un-widened is also what preserves the cadence property
  // the "block bisects a window" test locks in.
  const blockedIntervals = [
    ...[...(lessons ?? []), ...(locks ?? [])].map(r => ({
      start: DateTime.fromISO(r.start_at, { zone: 'utc' }).minus({ minutes: breakMinutes }),
      end: DateTime.fromISO(r.end_at, { zone: 'utc' }).plus({ minutes: breakMinutes }),
    })),
    ...rangedBlocks,
  ]

  // 8. Earliest bookable time: now + min_booking_notice_hours
  const earliestBookable = DateTime.utc().plus({ hours: min_booking_notice_hours })

  // 9. Generate slots across all availability windows for this day
  const slots: AvailableSlot[] = []

  for (const window of windows) {
    const winStart = DateTime.fromISO(`${date}T${window.start}`, { zone: timezone }).toUTC()
    const winEnd = DateTime.fromISO(`${date}T${window.end}`, { zone: timezone }).toUTC()

    if (!winStart.isValid || !winEnd.isValid) {
      throw new Error(`Invalid availability window for teacher ${teacherId} on ${date}`)
    }

    let cursor = winStart

    while (cursor.plus({ minutes: durationMinutes }) <= winEnd) {
      const slotEnd = cursor.plus({ minutes: durationMinutes })

      // Skip slots before the minimum notice horizon
      if (slotEnd > earliestBookable) {
        const overlaps = blockedIntervals.some(
          b => cursor < b.end && slotEnd > b.start
        )

        if (!overlaps) {
          slots.push({
            startAt: cursor.toISO()!,
            endAt: slotEnd.toISO()!,
          })
        }
      }

      cursor = slotEnd.plus({ minutes: breakMinutes })
    }
  }

  slots.sort((a, b) => a.startAt.localeCompare(b.startAt))

  return slots
}
