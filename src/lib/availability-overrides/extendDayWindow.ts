/**
 * Push the end of a teacher's last window on one date later, as a one-off.
 *
 * The subtlety this function exists to contain: `special_hours` rows do not
 * *add* to the weekly grid, they REPLACE it for that date. So extending a day
 * that has no special-hours rows yet cannot simply insert one for the evening —
 * that would delete the morning from that date. Every window of the day has to
 * be materialised, with only the last one's end moved.
 *
 * Blocked ranges already on the date are left untouched: they keep subtracting
 * from the new windows, which is the behaviour the reader contract describes.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeTime } from '@/lib/availability/constants'
import { resolveDayWindows } from '@/lib/availability/resolveDayWindows'

export type ExtendDayError =
  | { key: 'extendTooEarly' }
  | { key: 'extendPastMidnight' }
  | { key: 'resolveFailed' }

export async function extendDayWindow(params: {
  orgId: string
  teacherId: string
  /** YYYY-MM-DD in org timezone */
  date: string
  /** HH:MM in org timezone */
  newEndTime: string
}): Promise<ExtendDayError | null> {
  const { orgId, teacherId, date } = params
  const newEndTime = normalizeTime(params.newEndTime)

  // `end_time` is a `time` column with no date to roll into, so 23:59 is the
  // ceiling — 23:00 + 90 minutes has nowhere to go.
  if (!/^\d{2}:\d{2}$/.test(newEndTime) || newEndTime > '23:59') {
    return { key: 'extendPastMidnight' }
  }

  const day = await resolveDayWindows({ orgId, teacherId, date })
  if (day.fullDayBlocked || day.base.length === 0) return { key: 'resolveFailed' }

  const last = day.base[day.base.length - 1]
  if (newEndTime <= last.end) return { key: 'extendTooEarly' }

  const db = createServiceRoleClient()

  if (day.source === 'override') {
    // The date already describes its own hours; move the last one's end.
    const { data: rows, error: readError } = await db
      .from('availability_overrides')
      .select('id, start_time, end_time')
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId)
      .eq('override_date', date)
      .eq('is_available', true)

    if (readError || !rows?.length) return { key: 'resolveFailed' }

    const target = rows.reduce((a, b) =>
      normalizeTime(a.end_time as string) >= normalizeTime(b.end_time as string) ? a : b
    )

    const { error } = await db
      .from('availability_overrides')
      .update({ end_time: newEndTime })
      .eq('id', target.id)
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId)

    return error ? { key: 'resolveFailed' } : null
  }

  // Materialise the whole weekly day as special hours, extending only the last.
  // Anything less would silently drop the day's other windows.
  const rows = day.base.map((w, index) => ({
    organization_id: orgId,
    teacher_id: teacherId,
    override_date: date,
    is_available: true,
    start_time: w.start,
    end_time: index === day.base.length - 1 ? newEndTime : w.end,
    reason: null,
  }))

  const { error } = await db.from('availability_overrides').insert(rows)
  return error ? { key: 'resolveFailed' } : null
}
