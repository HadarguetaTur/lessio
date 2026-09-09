/**
 * Proves a lesson's teacher and students actually belong to the org the caller
 * is acting for, before anything is written.
 *
 * The teacher sub-shell already did this (canAccessStudent in
 * teacher/new-lesson/actions.ts, and its comment names the risk). The
 * owner/admin paths did not: their Zod schemas prove `teacher_id` and
 * `student_ids` are UUIDs and nothing else, and every query underneath runs on
 * the service-role client, which bypasses RLS. `assertStudentsAssignedToTeacher`
 * was only ever called in the `role === 'teacher'` branch.
 *
 * The sharpest consequence was not data theft but denial of service:
 * `no_teacher_lesson_overlap` is an EXCLUDE keyed on `teacher_id` alone, with
 * no org predicate. A lesson written in org A against org B's teacher id makes
 * that hour permanently unbookable in org B, and nobody in org B can see or
 * delete the row that did it. Billing is the other end of it — a lesson carries
 * a price and becomes a charge.
 *
 * Lives at the lib layer rather than in each action so a new caller is covered
 * by default; the audit kept finding the inline versions missing.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export class ParticipantNotInOrgError extends Error {
  readonly participant: 'teacher' | 'student'

  constructor(participant: 'teacher' | 'student') {
    super(`${participant} does not belong to this organization`)
    this.name = 'ParticipantNotInOrgError'
    this.participant = participant
  }
}

export async function assertParticipantsInOrg(
  orgId: string,
  teacherId: string,
  studentIds: string[]
): Promise<void> {
  const db = createServiceRoleClient()

  const { data: teacher } = await db
    .from('teachers')
    .select('id')
    .eq('id', teacherId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!teacher) throw new ParticipantNotInOrgError('teacher')

  const unique = [...new Set(studentIds)]
  if (unique.length === 0) return

  const { data: students } = await db
    .from('students')
    .select('id')
    .eq('organization_id', orgId)
    .in('id', unique)

  // A short list means at least one id is not this org's — an id that does not
  // exist and an id belonging to someone else are the same answer here, and
  // must stay the same answer, so the error cannot be used to probe.
  if ((students ?? []).length !== unique.length) {
    throw new ParticipantNotInOrgError('student')
  }
}
