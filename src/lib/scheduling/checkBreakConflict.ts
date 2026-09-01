/**
 * Whether a lesson about to be created by hand leaves the teacher their break.
 *
 * Deliberately a sibling of `checkTeacherAvailability` rather than a new status
 * on it: those statuses are mutually exclusive, and a lesson can sit perfectly
 * inside the teacher's window (`inside`) while still leaving them no gap. The
 * two questions are independent, so they answer separately and the notice
 * merges them.
 *
 * This is advisory only. A teacher or admin scheduling by hand may book
 * back-to-back — they are the ones who will teach it. What must never happen is
 * a *parent* being offered such a slot, and that is enforced in
 * getAvailableSlots and createSlotLock instead.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getEffectiveBreakMinutes } from './breaks'

export interface AdjacentLesson {
  id: string
  /** HH:MM in org timezone */
  start: string
  end: string
  /** Minutes actually free between this lesson and the proposed one. */
  gapMinutes: number
  /** Whether it runs before or after the proposed lesson. */
  side: 'before' | 'after'
}

export interface BreakConflict {
  requiredMinutes: number
  lessons: AdjacentLesson[]
}

export interface CheckBreakConflictParams {
  orgId: string
  teacherId: string
  /** YYYY-MM-DD in org timezone */
  date: string
  /** HH:MM in org timezone */
  startTime: string
  durationMinutes: number
  /** Set when editing, so a lesson is not judged against itself. */
  excludeLessonId?: string
}

export async function checkBreakConflict(
  params: CheckBreakConflictParams
): Promise<BreakConflict | null> {
  const { orgId, teacherId, date, startTime, durationMinutes, excludeLessonId } = params

  const { breakMinutes } = await getEffectiveBreakMinutes(orgId, teacherId)
  if (breakMinutes <= 0) return null

  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .single()
  if (!org) return null

  const tz = (org.timezone as string) ?? 'Asia/Jerusalem'
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone: tz })
  const end = start.plus({ minutes: durationMinutes })
  if (!start.isValid || !end.isValid) return null

  // Widen by the break and look for anything in the margin. A lesson that
  // genuinely overlaps is createLesson's business — it throws — so those are
  // filtered out below rather than reported here as a break problem.
  const windowStart = start.minus({ minutes: breakMinutes })
  const windowEnd = end.plus({ minutes: breakMinutes })

  const { data: rows } = await db
    .from('lessons')
    .select('id, start_at, end_at')
    .eq('organization_id', orgId)
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .lt('start_at', windowEnd.toUTC().toISO()!)
    .gt('end_at', windowStart.toUTC().toISO()!)
    .order('start_at')

  const lessons: AdjacentLesson[] = []

  for (const row of rows ?? []) {
    if (excludeLessonId && row.id === excludeLessonId) continue

    const otherStart = DateTime.fromISO(row.start_at, { zone: 'utc' })
    const otherEnd = DateTime.fromISO(row.end_at, { zone: 'utc' })

    // A true overlap is a hard conflict, reported elsewhere.
    if (otherStart < end && otherEnd > start) continue

    const side: 'before' | 'after' = otherEnd <= start ? 'before' : 'after'
    const gapMinutes =
      side === 'before'
        ? start.diff(otherEnd, 'minutes').minutes
        : otherStart.diff(end, 'minutes').minutes

    // The query above only narrows; the decision is made here. Leaving it to
    // the query would make the answer hinge on getting `gt` versus `gte` right
    // at the exact boundary, which is precisely where it matters.
    if (gapMinutes >= breakMinutes) continue

    lessons.push({
      id: row.id,
      start: otherStart.setZone(tz).toFormat('HH:mm'),
      end: otherEnd.setZone(tz).toFormat('HH:mm'),
      gapMinutes: Math.round(gapMinutes),
      side,
    })
  }

  if (lessons.length === 0) return null

  return { requiredMinutes: breakMinutes, lessons }
}
