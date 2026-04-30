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

type StudentLessonRow = {
  start_at: string
  lesson_students: { student_id: string }[] | null
}

export function buildStudentRows(
  students: StudentSummary[],
  lessons: StudentLessonRow[],
  thirtyDaysAgo: string
): StudentRow[] {
  const activityMap = new Map<string, { lastLesson: string | null; last30Count: number }>()

  for (const lesson of lessons) {
    for (const lessonStudent of lesson.lesson_students ?? []) {
      const existing = activityMap.get(lessonStudent.student_id) ?? {
        lastLesson: null,
        last30Count: 0,
      }

      if (!existing.lastLesson || lesson.start_at > existing.lastLesson) {
        existing.lastLesson = lesson.start_at
      }
      if (lesson.start_at >= thirtyDaysAgo) {
        existing.last30Count++
      }

      activityMap.set(lessonStudent.student_id, existing)
    }
  }

  return students.map((student) => {
    const activity = activityMap.get(student.id)
    return {
      studentId: student.id,
      studentName: student.full_name,
      lastLessonAt: activity?.lastLesson ?? null,
      lessonsLast30Days: activity?.last30Count ?? 0,
      isAtRisk: (activity?.last30Count ?? 0) === 0,
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

  const [studentsRes, lessonsRes] = await Promise.all([
    db
      .from('students')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('full_name'),

    db
      .from('lessons')
      .select('start_at, lesson_students(student_id)')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
  ])

  if (studentsRes.error) throw new Error(`Students report query failed: ${studentsRes.error.message}`)
  if (lessonsRes.error) throw new Error(`Students lessons query failed: ${lessonsRes.error.message}`)

  const rows = buildStudentRows(
    (studentsRes.data ?? []) as StudentSummary[],
    (lessonsRes.data ?? []) as StudentLessonRow[],
    thirtyDaysAgo
  )

  return { rows, atRiskCount: rows.filter(r => r.isAtRisk).length }
}
