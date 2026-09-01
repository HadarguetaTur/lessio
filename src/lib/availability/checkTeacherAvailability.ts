import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeTime } from './constants'
import { resolveDayWindows } from './resolveDayWindows'

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

  // 1-2. The day's shape: special hours for this date if any were set, else the
  //      weekly grid, minus every blocked range. That two-phase rule is shared
  //      with the slot generator and the leftover-time detector, so it lives in
  //      one place rather than being restated here.
  const day = await resolveDayWindows({ orgId, teacherId, date, timezone: tz })

  if (day.fullDayBlocked) {
    return {
      status: 'override_unavailable',
      reason: day.fullDayReason,
      dayOfWeek,
      windows: [],
      source: 'override',
    }
  }

  const { base, blocks, source } = day

  if (base.length === 0) {
    return { status: 'no_windows', dayOfWeek, windows: [], source }
  }

  // 3. Effective windows are the base minus every blocked range.
  const effective = day.windows

  const slotStartLocal = normalizeTime(startTime)
  // A lesson running past midnight wraps to "00:30", which would compare as
  // earlier than its own start. Windows are same-day by definition, so pin it
  // past every possible end instead.
  const slotEndLocal =
    slotEnd.toISODate() === localDate.toISODate() ? slotEnd.toFormat('HH:mm') : '24:00'
  const fits = (w: AvailabilityWindowTimes) =>
    slotStartLocal >= w.start && slotEndLocal <= w.end

  if (effective.some(fits)) return { status: 'inside' }

  // Blocks that leave nothing open are a whole-day statement, whatever shape
  // they were typed in. Reporting partial_override here would render "the hours
  // for this date are: —", which says nothing.
  if (blocks.length > 0 && effective.length === 0) {
    return {
      status: 'override_unavailable',
      reason: blocks.find((b) => b.reason)?.reason ?? null,
      dayOfWeek,
      windows: [],
      source: 'override',
    }
  }

  // A slot that would have fitted before the blocks is a different message from
  // one that never fitted: the reader blocked it themselves, and saying so with
  // their own reason is what makes the dialog actionable.
  const clash = blocks.find((b) => slotStartLocal < b.end && slotEndLocal > b.start)
  if (clash && base.some(fits)) {
    return {
      status: 'partial_override',
      reason: clash.reason,
      dayOfWeek,
      windows: effective,
      source: 'override',
    }
  }

  // Special hours narrow the day just as a block does, so a slot outside them
  // is still a partial_override — and the reason the reader typed on that row
  // is the one worth showing.
  if (source === 'override') {
    return {
      status: 'partial_override',
      reason: day.baseReason,
      dayOfWeek,
      windows: effective,
      source: 'override',
    }
  }

  return { status: 'outside_windows', dayOfWeek, windows: effective, source }
}
