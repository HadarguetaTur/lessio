/**
 * Student overview KPI queries.
 * Per /docs/sprint-24-scope.md § Story 3.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type StudentOverview = {
  attendanceRate: number        // 0–100, last 90 days (completed / (completed + no_show))
  homeworkCompletionRate: number // 0–100, sent assignments that are done
  outstandingBalance: number    // sum of pending charges for the student's primary parent
  totalLessons: number
  completedLessons: number
  totalAssignments: number
  doneAssignments: number
}

export async function getStudentOverview(
  orgId: string,
  studentId: string
): Promise<StudentOverview> {
  const db = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [lessonsResult, homeworkResult, parentResult] = await Promise.all([
    // Lessons in last 90 days (via lesson_students junction)
    db
      .from('lesson_students')
      .select('lessons ( status )')
      .eq('student_id', studentId)
      .gte('lessons.start_at', cutoff),

    // All homework assignments
    db
      .from('homework_assignments')
      .select('status, sent')
      .eq('organization_id', orgId)
      .eq('student_id', studentId),

    // Primary parent for balance
    db
      .from('relationships')
      .select('parent_id')
      .eq('student_id', studentId)
      .eq('organization_id', orgId)
      .eq('is_primary', true)
      .maybeSingle(),
  ])

  // Attendance calculation
  type LsRow = { lessons: { status: string } | null }
  const lessons = (lessonsResult.data ?? [])
    .map((r) => (r as unknown as LsRow).lessons)
    .filter(Boolean) as { status: string }[]

  const completedLessons = lessons.filter((l) => l.status === 'completed').length
  const noShowLessons    = lessons.filter((l) => l.status === 'no_show').length
  const attendanceDenom  = completedLessons + noShowLessons
  const attendanceRate   = attendanceDenom > 0
    ? Math.round((completedLessons / attendanceDenom) * 100)
    : 0

  // Homework completion
  type HwRow = { status: string; sent: boolean }
  const hw = (homeworkResult.data ?? []) as HwRow[]
  const sentHw = hw.filter((h) => h.sent)
  const doneHw = sentHw.filter((h) => h.status === 'done')
  const homeworkCompletionRate = sentHw.length > 0
    ? Math.round((doneHw.length / sentHw.length) * 100)
    : 0

  // Balance — find parent then sum pending charges
  let outstandingBalance = 0
  const primaryParentId = (parentResult.data as { parent_id: string } | null)?.parent_id
  if (primaryParentId) {
    const { data: chargeData } = await db
      .from('charges')
      .select('amount')
      .eq('parent_id', primaryParentId)
      .eq('organization_id', orgId)
      .eq('status', 'pending')

    outstandingBalance = (chargeData ?? []).reduce((s, c) => s + Number(c.amount), 0)
  }

  return {
    attendanceRate,
    homeworkCompletionRate,
    outstandingBalance,
    totalLessons: lessons.length,
    completedLessons,
    totalAssignments: hw.length,
    doneAssignments: doneHw.length,
  }
}
