/**
 * Teachers report data layer.
 * Counts lessons taught and revenue generated per teacher over a rolling period.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import { getRollingMonthsStart } from './params'

export type TeacherRow = {
  teacherId: string
  teacherName: string
  lessonsCount: number
  revenue: number
}

export type TeachersReportData = {
  rows: TeacherRow[]
}

type TeacherRelation = {
  id: string
  profiles: { full_name: string } | { full_name: string }[] | null
}

type ChargeLessonRelation = {
  teacher_id: string
}

export async function getTeachersReport(
  orgId: string,
  timezone: string,
  months = 3
): Promise<TeachersReportData> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const from = getRollingMonthsStart(timezone, months, now)

  const [lessonsRes, chargesRes] = await Promise.all([
    db
      .from('lessons')
      .select('teacher_id, teachers(id, profiles(full_name))')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gte('start_at', from),

    db
      .from('charges')
      .select('amount, lessons(teacher_id)')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .gte('paid_at', from),
  ])

  if (lessonsRes.error) throw new Error(`Teachers lessons query failed: ${lessonsRes.error.message}`)
  if (chargesRes.error) throw new Error(`Teachers charges query failed: ${chargesRes.error.message}`)

  const teacherMap = new Map<string, TeacherRow>()

  for (const lesson of lessonsRes.data ?? []) {
    const teacherRelation = lesson.teachers as unknown as TeacherRelation | TeacherRelation[] | null
    const teacher = Array.isArray(teacherRelation) ? (teacherRelation[0] ?? null) : teacherRelation
    if (!teacher) continue
    const teacherProfile = Array.isArray(teacher.profiles)
      ? (teacher.profiles[0] ?? null)
      : teacher.profiles

    const existing = teacherMap.get(teacher.id)
    if (existing) {
      existing.lessonsCount++
    } else {
      teacherMap.set(teacher.id, {
        teacherId: teacher.id,
        teacherName: teacherProfile?.full_name ?? '—',
        lessonsCount: 1,
        revenue: 0,
      })
    }
  }

  for (const charge of chargesRes.data ?? []) {
    const lessonRelation = charge.lessons as unknown as ChargeLessonRelation | ChargeLessonRelation[] | null
    const lesson = Array.isArray(lessonRelation) ? (lessonRelation[0] ?? null) : lessonRelation
    if (!lesson?.teacher_id) continue
    const row = teacherMap.get(lesson.teacher_id)
    if (row) {
      row.revenue += Number(charge.amount)
    }
  }

  const rows = [...teacherMap.values()].sort((a, b) => b.lessonsCount - a.lessonsCount)
  return { rows }
}
