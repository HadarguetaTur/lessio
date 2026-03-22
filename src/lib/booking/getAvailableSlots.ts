/**
 * getAvailableSlots — availability retrieval engine.
 * Per /docs/sprint-1-scope.md § EPIC 2 and /docs/decisions.md #1, #2, #6.
 *
 * All datetimes are stored as UTC in the DB.
 * The `date` parameter is a local date string (YYYY-MM-DD) in the org's timezone.
 * Slot start/end times are returned as UTC ISO strings.
 *
 * Slot formula (decisions.md #2):
 *   next_slot_start = current_slot_start + lesson_duration + break_duration_minutes
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface AvailableSlot {
  startAt: string // UTC ISO string
  endAt: string   // UTC ISO string
}

export interface GetAvailableSlotsParams {
  teacherId: string
  date: string         // YYYY-MM-DD in org timezone
  durationMinutes: number
  organizationId: string
}

export async function getAvailableSlots({
  teacherId,
  date,
  durationMinutes,
  organizationId,
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

  // 2. Determine day_of_week for the requested date in org timezone (0=Sunday)
  const localDate = DateTime.fromISO(date, { zone: timezone })
  if (!localDate.isValid) throw new Error(`Invalid date: ${date}`)
  const dayOfWeek = localDate.weekday % 7 // luxon: 1=Mon…7=Sun → 0=Sun, 1=Mon…6=Sat

  // 3. Check for a date-specific override first
  const { data: override } = await db
    .from('availability_overrides')
    .select('is_available, start_time, end_time')
    .eq('teacher_id', teacherId)
    .eq('override_date', date)
    .maybeSingle()

  // If override exists and marks the day unavailable → no slots
  if (override && !override.is_available) return []

  // 4. Determine the availability window
  let windowStart: string | null = null
  let windowEnd: string | null = null

  if (override && override.is_available && override.start_time && override.end_time) {
    // Override provides a custom window for this specific date
    windowStart = override.start_time
    windowEnd = override.end_time
  } else {
    // Fall back to recurring weekly availability
    const { data: weekly } = await db
      .from('availability')
      .select('start_time, end_time')
      .eq('teacher_id', teacherId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    if (!weekly) return [] // No availability defined for this day
    windowStart = weekly.start_time
    windowEnd = weekly.end_time
  }

  // 5. Build UTC timestamps for the availability window on this date
  const winStart = DateTime.fromISO(`${date}T${windowStart}`, { zone: timezone }).toUTC()
  const winEnd = DateTime.fromISO(`${date}T${windowEnd}`, { zone: timezone }).toUTC()

  if (!winStart.isValid || !winEnd.isValid) {
    throw new Error(`Invalid availability window for teacher ${teacherId} on ${date}`)
  }

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

  const blockedIntervals = [
    ...(lessons ?? []),
    ...(locks ?? []),
  ].map(r => ({
    start: DateTime.fromISO(r.start_at, { zone: 'utc' }),
    end: DateTime.fromISO(r.end_at, { zone: 'utc' }),
  }))

  // 8. Earliest bookable time: now + min_booking_notice_hours
  const earliestBookable = DateTime.utc().plus({ hours: min_booking_notice_hours })

  // 9. Generate slots
  const slots: AvailableSlot[] = []
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

    cursor = slotEnd.plus({ minutes: break_duration_minutes })
  }

  return slots
}
