/**
 * Tenant binding for the people a lesson names.
 *
 * `createLesson` and `createLessonSeries` both take a teacherId and a roster
 * of studentIds that originate in a form, and both write with RLS bypassed
 * while stamping `organization_id` from the session. Nothing else in either
 * path establishes that those people are the session org's, so a foreign id
 * produced a lesson claiming one tenant while pointing at another's teacher or
 * student — and that student's name then appeared in the attacking org's
 * lesson lists, schedule and billing.
 *
 * This lives at the choke point rather than at each caller: booking, the
 * dashboard's new-lesson form, the series builder and the teacher shell all
 * funnel through those two functions, and only some of them checked.
 */

import { assertIdsBelongToOrg } from '@/lib/auth/orgScope'

/**
 * Throws OrgScopeError unless the teacher and every student belong to `orgId`.
 *
 * Students are checked as one batch: the row count must match the id count, so
 * a roster that mixes one foreign student among five valid ones is rejected
 * whole rather than silently trimmed.
 */
export async function assertLessonPeopleBelongToOrg(
  orgId: string,
  teacherId: string,
  studentIds: readonly string[]
): Promise<void> {
  await assertIdsBelongToOrg('teachers', [teacherId], orgId)
  await assertIdsBelongToOrg('students', studentIds, orgId)
}
