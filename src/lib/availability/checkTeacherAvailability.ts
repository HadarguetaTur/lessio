import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type AvailabilityCheckResult =
  | { status: 'inside' }
  | { status: 'no_windows' }
  | { status: 'outside_windows' }
  | { status: 'override_unavailable'; reason: string | null }
  | { status: 'partial_override'; reason: string | null }

export interface CheckTeacherAvailabilityParams {
  orgId: string
  teacherId: string
  date: string            // YYYY-MM-DD in org timezone
  startTime: string       // HH:MM in org timezone
  durationMinutes: number
}

/**
 * Soft availability check used by the schedule UI before persisting a lesson.
 *
 * Unlike `createLesson` (which throws on holidays/teacher/student conflicts),
 * this check is advisory: the caller may decide to schedule anyway after
 * confirming with the user.
 *
 * Returns one of:
 *  - `inside`               → slot fits a recurring window or an override window
 *  - `no_windows`           → teacher has no availability for this weekday
 *  - `outside_windows`      → has windows on this weekday but the slot doesn't fit
 *  - `override_unavailable` → date is explicitly marked unavailable (e.g. vacation)
 *  - `partial_override`     → has an override window for this date but slot is outside it
 */
export async function checkTeacherAvailability(
  params: CheckTeacherAvailabilityParams
): Promise<AvailabilityCheckResult> {
  const { orgId, teacherId, date, startTime, durationMinutes } = params

  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .single()
  if (!org) return { status: 'no_windows' }

  const tz = org.timezone as string
  const localDate = DateTime.fromISO(date, { zone: tz })
  if (!localDate.isValid) return { status: 'no_windows' }

  // Luxon weekday: 1=Mon…7=Sun → 0=Sun, 1=Mon…6=Sat
  const dayOfWeek = localDate.weekday % 7

  const slotStart = DateTime.fromISO(`${date}T${startTime}`, { zone: tz })
  const slotEnd = slotStart.plus({ minutes: durationMinutes })
  if (!slotStart.isValid || !slotEnd.isValid) return { status: 'no_windows' }

  // 1. Date-specific override takes precedence
  const { data: override } = await db
    .from('availability_overrides')
    .select('is_available, start_time, end_time, reason')
    .eq('teacher_id', teacherId)
    .eq('organization_id', orgId)
    .eq('override_date', date)
    .maybeSingle()

  if (override && !override.is_available) {
    return { status: 'override_unavailable', reason: override.reason ?? null }
  }

  if (override && override.is_available && override.start_time && override.end_time) {
    const winStart = DateTime.fromISO(`${date}T${override.start_time}`, { zone: tz })
    const winEnd = DateTime.fromISO(`${date}T${override.end_time}`, { zone: tz })
    if (slotStart >= winStart && slotEnd <= winEnd) {
      return { status: 'inside' }
    }
    return { status: 'partial_override', reason: override.reason ?? null }
  }

  // 2. Fall back to recurring weekly availability — there can be multiple
  //    windows per weekday; the slot only needs to fit inside one of them.
  const { data: windows } = await db
    .from('availability')
    .select('start_time, end_time')
    .eq('teacher_id', teacherId)
    .eq('organization_id', orgId)
    .eq('day_of_week', dayOfWeek)

  if (!windows || windows.length === 0) {
    return { status: 'no_windows' }
  }

  for (const w of windows) {
    const winStart = DateTime.fromISO(`${date}T${w.start_time}`, { zone: tz })
    const winEnd = DateTime.fromISO(`${date}T${w.end_time}`, { zone: tz })
    if (slotStart >= winStart && slotEnd <= winEnd) {
      return { status: 'inside' }
    }
  }

  return { status: 'outside_windows' }
}
