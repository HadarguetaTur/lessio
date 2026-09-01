/**
 * What a teacher's day actually looks like, once the weekly grid and every
 * date-specific exception have been reconciled.
 *
 * The rule (see availability_overrides' table comment) is two-phase: the base
 * windows are the special-hours rows for that date if any exist, otherwise the
 * weekly grid for that weekday; then every blocked range is subtracted. That
 * rule was written out separately in getAvailableSlots and in
 * checkTeacherAvailability, and the tail detector would have been the third
 * copy — so it lives here once.
 *
 * Times are wall-clock "HH:MM" strings in the org timezone, never instants.
 * A weekly rule has no instant to convert, and comparing the strings is what
 * keeps a window typed on a DST-transition day from drifting.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeTime, subtractRanges, type TimeRange } from './constants'

export interface DayWindows {
  /** Open windows after blocks are subtracted, sorted, possibly empty. */
  windows: TimeRange[]
  /** The base windows before subtraction — what the teacher configured. */
  base: TimeRange[]
  blocks: (TimeRange & { reason: string | null })[]
  /** Which rule produced `base`. */
  source: 'weekly' | 'override'
  /** The date is closed outright; `windows` is empty. */
  fullDayBlocked: boolean
  /**
   * What the teacher typed on the whole-day block, when there is one. Carried
   * because "not available" and "not available — away at a conference" are very
   * different things to show someone whose booking just failed.
   */
  fullDayReason: string | null
  /** The reason on the special-hours rows, when the base came from them. */
  baseReason: string | null
}

const EMPTY: DayWindows = {
  windows: [],
  base: [],
  blocks: [],
  source: 'weekly',
  fullDayBlocked: false,
  fullDayReason: null,
  baseReason: null,
}

export async function resolveDayWindows(params: {
  orgId: string
  teacherId: string
  /** YYYY-MM-DD in org timezone */
  date: string
  /** Saves a lookup when the caller already has it. */
  timezone?: string
}): Promise<DayWindows> {
  const { orgId, teacherId, date } = params
  const db = createServiceRoleClient()

  let timezone = params.timezone
  if (!timezone) {
    const { data: org } = await db
      .from('organizations')
      .select('timezone')
      .eq('id', orgId)
      .single()
    if (!org) return EMPTY
    timezone = (org.timezone as string) ?? 'Asia/Jerusalem'
  }

  const localDate = DateTime.fromISO(date, { zone: timezone })
  if (!localDate.isValid) return EMPTY

  // Luxon weekday: 1=Mon…7=Sun → 0=Sun, 1=Mon…6=Sat
  const dayOfWeek = localDate.weekday % 7

  // Several rows per date are legal — a morning and an evening can be blocked
  // separately — so this is a list read, never maybeSingle().
  const { data: overrideRows, error } = await db
    .from('availability_overrides')
    .select('is_available, start_time, end_time, reason')
    .eq('teacher_id', teacherId)
    .eq('organization_id', orgId)
    .eq('override_date', date)

  if (error) return EMPTY

  const overrides = overrideRows ?? []

  const fullDayBlock = overrides.find((o) => !o.is_available && !o.start_time)
  if (fullDayBlock) {
    return {
      ...EMPTY,
      source: 'override',
      fullDayBlocked: true,
      fullDayReason: (fullDayBlock.reason as string | null) ?? null,
    }
  }

  const specialHours = overrides.filter((o) => o.is_available && o.start_time && o.end_time)
  const blocks = overrides
    .filter((o) => !o.is_available && o.start_time && o.end_time)
    .map((o) => ({
      start: normalizeTime(o.start_time as string),
      end: normalizeTime(o.end_time as string),
      reason: (o.reason as string | null) ?? null,
    }))

  let base: TimeRange[]
  let source: 'weekly' | 'override'
  let baseReason: string | null = null

  if (specialHours.length > 0) {
    baseReason = (specialHours.find((o) => o.reason)?.reason as string | null) ?? null
    // Special hours for this date replace the weekly grid entirely.
    source = 'override'
    base = specialHours.map((o) => ({
      start: normalizeTime(o.start_time as string),
      end: normalizeTime(o.end_time as string),
    }))
  } else {
    source = 'weekly'
    const { data: weekly } = await db
      .from('availability')
      .select('start_time, end_time')
      .eq('teacher_id', teacherId)
      .eq('organization_id', orgId)
      .eq('day_of_week', dayOfWeek)

    base = (weekly ?? []).map((w) => ({
      start: normalizeTime(w.start_time as string),
      end: normalizeTime(w.end_time as string),
    }))
  }

  base = [...base].sort((a, b) => a.start.localeCompare(b.start))

  return {
    windows: subtractRanges(base, blocks),
    base,
    blocks,
    source,
    fullDayBlocked: false,
    fullDayReason: null,
    baseReason,
  }
}
