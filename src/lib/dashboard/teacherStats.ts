/**
 * KPI stats for the teacher dashboard page.
 * Server-only — uses service role client.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import { getTodayRange, localMidnightToUTC, getCurrentWeekSunday } from '@/lib/lessons'

export type TeacherDashboardStats = {
  lessonsToday: number
  lessonsThisWeek: number
  completedThisMonth: number
  activeStudents: number
}

export async function getTeacherDashboardStats(
  orgId: string,
  teacherId: string,
  timezone: string
): Promise<TeacherDashboardStats> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)

  const { gte: todayGte, lt: todayLt } = getTodayRange(timezone)

  const weekSundayStr = getCurrentWeekSunday(timezone)
  const weekStartUTC = localMidnightToUTC(weekSundayStr, timezone)
  const weekEndUTC = new Date(weekStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000)

  const monthStart = now.startOf('month').toUTC().toISO()!

  const [todayRes, weekRes, completedRes, studentsRes] = await Promise.all([
    db
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId)
      .neq('status', 'cancelled')
      .gte('start_at', todayGte)
      .lt('start_at', todayLt),

    db
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId)
      .neq('status', 'cancelled')
      .gte('start_at', weekStartUTC.toISOString())
      .lt('start_at', weekEndUTC.toISOString()),

    db
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId)
      .eq('status', 'completed')
      .gte('start_at', monthStart),

    db
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId)
      .eq('is_active', true),
  ])

  return {
    lessonsToday: todayRes.count ?? 0,
    lessonsThisWeek: weekRes.count ?? 0,
    completedThisMonth: completedRes.count ?? 0,
    activeStudents: studentsRes.count ?? 0,
  }
}
