/**
 * The attendance roster for the outcome forms (decision #46): every enrolled
 * student with what was recorded. Service role — the lesson page has already
 * authorised the viewer; a teacher's RLS read of lesson_students would hide
 * the attendance columns added after her policy was written.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Attendance } from './attendance'

export interface RosterStudent {
  studentId: string
  fullName: string
  /** Null = not marked; on a completed lesson that reads as present. */
  attendance: Attendance | null
}

export async function getLessonRoster(lessonId: string, organizationId: string): Promise<RosterStudent[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_students')
    .select('student_id, attendance, students!inner(full_name, organization_id)')
    .eq('lesson_id', lessonId)
    .eq('students.organization_id', organizationId)
  if (error) throw new Error(`[roster] read failed: ${error.message}`)
  return ((data ?? []) as unknown as Array<{
    student_id: string
    attendance: Attendance | null
    students: { full_name: string } | { full_name: string }[] | null
  }>)
    .map((row) => {
      const student = Array.isArray(row.students) ? row.students[0] : row.students
      return { studentId: row.student_id, fullName: student?.full_name ?? '—', attendance: row.attendance }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}
