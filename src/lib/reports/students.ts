/**
 * Students report data layer.
 * Lists active students with recent lesson activity; flags at-risk (0 lessons in 30 days).
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'

export type StudentRow = {
  studentId: string
  studentName: string
  lastLessonAt: string | null
  lessonsLast30Days: number
  isAtRisk: boolean
}

export type StudentsReportData = {
  rows: StudentRow[]
  atRiskCount: number
}

type StudentSummary = {
  id: string
  full_name: string
}

/** One row per student from the `student_lesson_activity` SQL function. */
type StudentActivityRow = {
  student_id: string
  /** All-time last non-cancelled lesson — deliberately not bounded to 30 days. */
  last_lesson_at: string | null
  /** Non-cancelled lessons since the cutoff passed to the function. */
  lessons_since: number | string
}

export function buildStudentRows(
  students: StudentSummary[],
  activity: StudentActivityRow[]
): StudentRow[] {
  const activityMap = new Map(activity.map((row) => [row.student_id, row]))

  return students.map((student) => {
    const row = activityMap.get(student.id)
    // bigint comes back from PostgREST as a string.
    const last30Count = row ? Number(row.lessons_since) : 0
    return {
      studentId: student.id,
      studentName: student.full_name,
      lastLessonAt: row?.last_lesson_at ?? null,
      lessonsLast30Days: last30Count,
      isAtRisk: last30Count === 0,
    }
  })
}

export async function getStudentsReport(
  orgId: string,
  timezone: string
): Promise<StudentsReportData> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const thirtyDaysAgo = now.minus({ days: 30 }).toUTC().toISO()!

  // Aggregated in Postgres (supabase/migrations/20260911090500_student_lesson_activity_fn.sql):
  // this used to fetch every lesson the org ever had into Node on each
  // dashboard render just to derive two numbers per student.
  const [studentsRes, activityRes] = await Promise.all([
    db
      .from('students')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('full_name'),

    db.rpc('student_lesson_activity', { p_org_id: orgId, p_since: thirtyDaysAgo }),
  ])

  if (studentsRes.error) throw new Error(`Students report query failed: ${studentsRes.error.message}`)
  if (activityRes.error) throw new Error(`Students lessons query failed: ${activityRes.error.message}`)

  const rows = buildStudentRows(
    (studentsRes.data ?? []) as StudentSummary[],
    (activityRes.data ?? []) as StudentActivityRow[]
  )

  return { rows, atRiskCount: rows.filter(r => r.isAtRisk).length }
}
