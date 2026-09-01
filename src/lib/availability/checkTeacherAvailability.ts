import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeTime } from './constants'

export interface AvailabilityWindowTimes {
  /** HH:MM in org timezone */
  start: string
  end: string
}

/**
 * What the teacher's availability actually says, carried alongside every
 * non-`inside` status. Without it the UI can only say "not available" — which
 * is what made a mis-imported weekly grid impossible to diagnose from the
 * screen it broke.
 */
export interface AvailabilityEvidence {
  /** 0=Sun…6=Sat in org timezone; null when the org row or date was unusable. */
  dayOfWeek: number | null
  /** Windows for that weekday, or the single override window. Sorted by start. */
  windows: AvailabilityWindowTimes[]
  /** Which rule produced `windows` — the UI words the two cases differently. */
  source: 'weekly' | 'override'
}

export type AvailabilityCheckResult =
  | { status: 'inside' }
  | ({ status: 'no_windows' } & AvailabilityEvidence)
  | ({ status: 'outside_windows' } & AvailabilityEvidence)
  | ({ status: 'override_unavailable'; reason: string | null } & AvailabilityEvidence)
  | ({ status: 'partial_override'; reason: string | null } & AvailabilityEvidence)

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

  // Nothing to say about a date we could not resolve. `no_windows` never
  // blocks the caller, so these degenerate exits stay silent.
  const unknown: AvailabilityEvidence = { dayOfWeek: null, windows: [], source: 'weekly' }

  const { data: org } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .single()
  if (!org) return { status: 'no_windows', ...unknown }

  const tz = org.timezone as string
  const localDate = DateTime.fromISO(date, { zone: tz })
  if (!localDate.isValid) return { status: 'no_windows', ...unknown }

  // Luxon weekday: 1=Mon…7=Sun → 0=Sun, 1=Mon…6=Sat
  const dayOfWeek = localDate.weekday % 7

  const slotStart = DateTime.fromISO(`${date}T${startTime}`, { zone: tz })
  const slotEnd = slotStart.plus({ minutes: durationMinutes })
  if (!slotStart.isValid || !slotEnd.isValid) return { status: 'no_windows', ...unknown }

  // 1. Date-specific override takes precedence
  const { data: override } = await db
    .from('availability_overrides')
    .select('is_available, start_time, end_time, reason')
    .eq('teacher_id', teacherId)
    .eq('organization_id', orgId)
    .eq('override_date', date)
    .maybeSingle()

  if (override && !override.is_available) {
    return {
      status: 'override_unavailable',
      reason: override.reason ?? null,
      dayOfWeek,
      windows: [],
      source: 'override',
    }
  }

  if (override && override.is_available && override.start_time && override.end_time) {
    const winStart = DateTime.fromISO(`${date}T${override.start_time}`, { zone: tz })
    const winEnd = DateTime.fromISO(`${date}T${override.end_time}`, { zone: tz })
    if (slotStart >= winStart && slotEnd <= winEnd) {
      return { status: 'inside' }
    }
    return {
      status: 'partial_override',
      reason: override.reason ?? null,
      dayOfWeek,
      windows: [
        {
          start: normalizeTime(override.start_time),
          end: normalizeTime(override.end_time),
        },
      ],
      source: 'override',
    }
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
    return { status: 'no_windows', dayOfWeek, windows: [], source: 'weekly' }
  }

  for (const w of windows) {
    const winStart = DateTime.fromISO(`${date}T${w.start_time}`, { zone: tz })
    const winEnd = DateTime.fromISO(`${date}T${w.end_time}`, { zone: tz })
    if (slotStart >= winStart && slotEnd <= winEnd) {
      return { status: 'inside' }
    }
  }

  // Sorted here rather than with .order() — the query is three .eq() links deep
  // and its test mock ends the chain there.
  const shown = windows
    .map((w) => ({ start: normalizeTime(w.start_time), end: normalizeTime(w.end_time) }))
    .sort((a, b) => a.start.localeCompare(b.start))

  return { status: 'outside_windows', dayOfWeek, windows: shown, source: 'weekly' }
}
