/**
 * Teacher-scoped report data layer.
 * Server-only — uses service role client.
 * Filters all queries to the requesting teacher's own lessons and students.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import type { AppLocale } from '@/lib/i18n/locale'
import { toLuxonLocale } from '@/lib/i18n/locale'
import { getRollingMonthsStart } from './params'

// ── Lessons by month ────────────────────────────────────────────────────────

export type TeacherMonthlyLessonBucket = {
  month: string   // 'yyyy-MM'
  label: string
  completed: number
  cancelled: number
  noShow: number
}

export type TeacherLessonsReportData = {
  buckets: TeacherMonthlyLessonBucket[]
  totalCompleted: number
  totalCancelled: number
  totalNoShow: number
}

export async function getTeacherLessonsReport(
  teacherId: string,
  orgId: string,
  timezone: string,
  months = 12,
  locale: AppLocale = 'he'
): Promise<TeacherLessonsReportData> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const from = getRollingMonthsStart(timezone, months, now)

  const { data, error } = await db
    .from('lessons')
    .select('start_at, status')
    .eq('organization_id', orgId)
    .eq('teacher_id', teacherId)
    .gte('start_at', from)

  if (error) throw new Error(`Teacher lessons report failed: ${error.message}`)

  const bucketMap = new Map<string, { completed: number; cancelled: number; noShow: number }>()
  for (let i = months - 1; i >= 0; i--) {
    bucketMap.set(now.minus({ months: i }).startOf('month').toFormat('yyyy-MM'), {
      completed: 0,
      cancelled: 0,
      noShow: 0,
    })
  }

  for (const lesson of data ?? []) {
    const key = DateTime.fromISO(lesson.start_at, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('yyyy-MM')
    const bucket = bucketMap.get(key)
    if (!bucket) continue
    if (lesson.status === 'completed') bucket.completed++
    else if (lesson.status === 'cancelled') bucket.cancelled++
    else if (lesson.status === 'no_show') bucket.noShow++
  }

  const luxonLoc = toLuxonLocale(locale)
  const buckets: TeacherMonthlyLessonBucket[] = [...bucketMap.entries()].map(([month, b]) => ({
    month,
    label: DateTime.fromFormat(month, 'yyyy-MM', { zone: timezone })
      .setLocale(luxonLoc)
      .toFormat('LLLL yyyy'),
    ...b,
  }))

  return {
    buckets,
    totalCompleted: buckets.reduce((s, b) => s + b.completed, 0),
    totalCancelled: buckets.reduce((s, b) => s + b.cancelled, 0),
    totalNoShow: buckets.reduce((s, b) => s + b.noShow, 0),
  }
}

// ── Student attendance ──────────────────────────────────────────────────────

export type StudentAttendanceRow = {
  studentId: string
  fullName: string
  totalLessons: number      // completed + no_show (excludes cancelled)
  completed: number
  attendanceRate: number    // 0–100, or null if no lessons
  atRisk: boolean           // < 70% and at least 2 lessons
}

export type TeacherStudentsReportData = {
  rows: StudentAttendanceRow[]
  atRiskCount: number
}

export async function getTeacherStudentsReport(
  teacherId: string,
  orgId: string,
  timezone: string,
  months = 3
): Promise<TeacherStudentsReportData> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const from = getRollingMonthsStart(timezone, months, now)

  const [studentsRes, lessonsRes] = await Promise.all([
    db
      .from('students')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId)
      .eq('is_active', true)
      .order('full_name', { ascending: true }),

    db
      .from('lessons')
      .select('id, status, lesson_students(student_id)')
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId)
      .in('status', ['completed', 'no_show'])
      .gte('start_at', from),
  ])

  if (studentsRes.error) throw new Error(`Students query failed: ${studentsRes.error.message}`)
  if (lessonsRes.error) throw new Error(`Lessons query failed: ${lessonsRes.error.message}`)

  // Build per-student counters
  const completedByStudent = new Map<string, number>()
  const noShowByStudent = new Map<string, number>()

  for (const lesson of lessonsRes.data ?? []) {
    const studentIds = (lesson.lesson_students as { student_id: string }[] ?? []).map(
      (ls) => ls.student_id
    )
    for (const sid of studentIds) {
      if (lesson.status === 'completed') {
        completedByStudent.set(sid, (completedByStudent.get(sid) ?? 0) + 1)
      } else if (lesson.status === 'no_show') {
        noShowByStudent.set(sid, (noShowByStudent.get(sid) ?? 0) + 1)
      }
    }
  }

  const rows: StudentAttendanceRow[] = (studentsRes.data ?? []).map((s) => {
    const completed = completedByStudent.get(s.id) ?? 0
    const noShow = noShowByStudent.get(s.id) ?? 0
    const totalLessons = completed + noShow
    const attendanceRate = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 100
    const atRisk = totalLessons >= 2 && attendanceRate < 70

    return {
      studentId: s.id,
      fullName: s.full_name,
      totalLessons,
      completed,
      attendanceRate,
      atRisk,
    }
  })

  return {
    rows,
    atRiskCount: rows.filter((r) => r.atRisk).length,
  }
}
