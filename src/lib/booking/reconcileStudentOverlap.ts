/**
 * Closes the student double-booking race (SCHED-06).
 *
 * A teacher cannot be double-booked: `no_teacher_lesson_overlap` is a GiST
 * EXCLUDE, so the database itself rejects the second insert however the two
 * requests interleave. A *student* has no such constraint — `lesson_students`
 * carries only `UNIQUE (lesson_id, student_id)`, which says a student appears
 * once per lesson and nothing at all about two lessons at the same hour.
 *
 * Every student check in the codebase is therefore read-then-insert with no
 * transaction and no lock, and PostgREST gives us neither. Two requests booking
 * the same child with two different teachers at 17:00 both read "free" and both
 * insert; the child is now in two places, and both lessons become charges.
 *
 * A real EXCLUDE would need `start_at`/`end_at` denormalised onto
 * `lesson_students` plus triggers to keep them in step with every lesson
 * reschedule — a schema change with a live-data backfill, on tables another
 * agent is currently editing. This is the compare-and-swap instead: after the
 * row is written it becomes visible, so we look again, and if somebody else got
 * there first we take our own row back out.
 *
 * The tie-break is what makes it safe. Both racers see the same pair and both
 * apply the same rule — the OLDER lesson wins, by created_at and then by id —
 * so exactly one of them withdraws. Ordering by age rather than by id alone
 * also means a genuinely pre-existing lesson that the pre-check simply missed
 * always beats the new one, which is the answer a human would give.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

type Db = ReturnType<typeof createServiceRoleClient>

interface LessonRow {
  id: string
  created_at: string | null
}

/** True when `mine` should yield to `other`. */
function loses(mine: LessonRow, other: LessonRow): boolean {
  const a = mine.created_at ?? ''
  const b = other.created_at ?? ''
  if (a !== b) return a > b
  // Identical timestamps are possible at millisecond resolution; the id is an
  // arbitrary but stable total order, which is all the tie-break needs to be.
  return mine.id > other.id
}

/**
 * Deletes the just-inserted lesson if another lesson has taken one of its
 * students for the same hour. Returns true when the lesson was withdrawn, so
 * the caller can report a student conflict exactly as its pre-check would have.
 */
export async function reconcileStudentOverlap(params: {
  db: Db
  orgId: string
  lessonId: string
  studentIds: string[]
  startUtc: string
  endUtc: string
}): Promise<boolean> {
  const { db, orgId, lessonId, studentIds, startUtc, endUtc } = params
  if (studentIds.length === 0) return false

  const { data: mine } = await db
    .from('lessons')
    .select('id, created_at')
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!mine) return false

  const { data: junction } = await db
    .from('lesson_students')
    .select('lesson_id')
    .eq('organization_id', orgId)
    .in('student_id', studentIds)
  const candidateIds = [...new Set((junction ?? []).map((r) => r.lesson_id as string))].filter(
    (id) => id !== lessonId
  )
  if (candidateIds.length === 0) return false

  const { data: clashes } = await db
    .from('lessons')
    .select('id, created_at')
    .in('id', candidateIds)
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')
    .lt('start_at', endUtc)
    .gt('end_at', startUtc)

  const losingTo = (clashes ?? []).find((other) => loses(mine as LessonRow, other as LessonRow))
  if (!losingTo) return false

  console.warn('[reconcileStudentOverlap] withdrawing a lesson that lost a student race', {
    orgId,
    lessonId,
    lostTo: losingTo.id,
  })

  // lesson_students cascades on delete, so the junction rows go with it.
  await db.from('lessons').delete().eq('id', lessonId).eq('organization_id', orgId)
  return true
}
