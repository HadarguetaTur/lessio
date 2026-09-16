/**
 * Attendance is per student; the lesson status is derived from it
 * (decision #46). This module is the only place that decides who was absent.
 *
 * `lesson_students.attendance` is nullable on purpose: the auto-completion cron
 * completes a lesson with nobody at the keyboard, and "not marked" on a
 * completed lesson means present — the lesson happened and is billed as such.
 *
 * Pure — no DB.
 */

export type Attendance = 'present' | 'absent'
export type DeliveredStatus = 'completed' | 'no_show'

/**
 * Was this student absent from this lesson?
 *
 * A `no_show` lesson is one where every student was absent, so a legacy
 * no_show row with no attendance recorded reads as absent for everyone.
 */
export function isStudentAbsent(lessonStatus: string, attendance: string | null | undefined): boolean {
  if (lessonStatus === 'no_show') return true
  if (lessonStatus !== 'completed') return false
  return attendance === 'absent'
}

export interface NormalizedOutcome {
  status: DeliveredStatus
  /** Attendance to write, per roster student. Null = leave attendance untouched. */
  attendance: Map<string, Attendance> | null
}

/**
 * Turns what a form submitted into a consistent (status, attendance) pair.
 *
 * - An explicit present-list wins: nobody present ⇒ `no_show`, anyone ⇒ `completed`.
 * - `no_show` without a list ⇒ the whole roster absent.
 * - `completed` without a list ⇒ attendance untouched (null = present).
 *
 * Present ids that are not on the roster are ignored — the roster is the truth.
 */
export function normalizeOutcome(input: {
  status: DeliveredStatus
  rosterStudentIds: readonly string[]
  presentStudentIds?: readonly string[] | null
}): NormalizedOutcome {
  const { status, rosterStudentIds, presentStudentIds } = input
  if (rosterStudentIds.length === 0) return { status, attendance: null }

  if (presentStudentIds) {
    const present = new Set(presentStudentIds)
    const attendance = new Map<string, Attendance>()
    let anyPresent = false
    for (const id of rosterStudentIds) {
      const here = present.has(id)
      if (here) anyPresent = true
      attendance.set(id, here ? 'present' : 'absent')
    }
    return { status: anyPresent ? 'completed' : 'no_show', attendance }
  }

  if (status === 'no_show') {
    return { status, attendance: new Map(rosterStudentIds.map((id) => [id, 'absent' as const])) }
  }
  return { status, attendance: null }
}
