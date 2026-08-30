import type { UserSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getTeacherByProfileId } from '@/lib/teachers'

/**
 * Authorizes access to a student without relying on RLS.
 *
 * `students.teacher_id` is the current teacher assignment. Lesson links are
 * scheduling/history records and must not grant permanent mutation access.
 * Owners and admins may access any student in their organization; teachers may
 * access only students currently assigned to their active teacher record.
 */
export async function canAccessStudent(
  session: Pick<UserSession, 'orgId' | 'profileId' | 'role'>,
  studentId: string
): Promise<boolean> {
  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return false
  }

  const db = createServiceRoleClient()
  const { data: student, error } = await db
    .from('students')
    .select('teacher_id')
    .eq('id', studentId)
    .eq('organization_id', session.orgId)
    .maybeSingle()

  if (error || !student) return false
  if (session.role === 'owner' || session.role === 'admin') return true

  const teacher = await getTeacherByProfileId(session.profileId, session.orgId, {
    activeOnly: true,
  })
  return teacher !== null && student.teacher_id === teacher.id
}
