import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface TeacherPerformanceRow {
  teacherId: string
  teacherName: string
  lessonsDelivered: number
  lessonsCancelled: number
  cancellationRate: number
  noShowCount: number
  revenue: number
  studentCount: number
  avgMonthlyLessons: number
  monthlyBreakdown: { month: string; delivered: number; cancelled: number }[]
}

export interface TeacherPerformanceData {
  teachers: TeacherPerformanceRow[]
  orgAverages: {
    avgLessonsDelivered: number
    avgCancellationRate: number
    avgRevenue: number
  }
}

export async function getTeacherPerformance(
  orgId: string,
  timezone: string,
  months: number = 3
): Promise<TeacherPerformanceData> {
  const supabase = createServiceRoleClient()

  const now = DateTime.now().setZone(timezone)
  const startDate = now.minus({ months }).startOf('month')
  const startIso = startDate.toUTC().toISO()!

  // Fetch lessons in the period for this org
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select(`
      id,
      teacher_id,
      status,
      start_at,
      teachers!inner(
        id,
        profiles!inner(full_name)
      )
    `)
    .eq('organization_id', orgId)
    .gte('start_at', startIso)
    .in('status', ['completed', 'cancelled', 'no_show'])

  if (lessonsError) throw new Error(`Failed to fetch lessons: ${lessonsError.message}`)

  // Fetch revenue: charges linked to lessons in the period
  const lessonIds = (lessons ?? []).map((l) => l.id)

  let revenueByTeacher: Record<string, number> = {}
  if (lessonIds.length > 0) {
    // Process in batches to avoid URL length limits
    const BATCH_SIZE = 200
    for (let i = 0; i < lessonIds.length; i += BATCH_SIZE) {
      const batch = lessonIds.slice(i, i + BATCH_SIZE)
      const { data: charges, error: chargesError } = await supabase
        .from('charges')
        .select('lesson_id, amount')
        .eq('organization_id', orgId)
        .eq('status', 'paid')
        .in('lesson_id', batch)

      if (chargesError) throw new Error(`Failed to fetch charges: ${chargesError.message}`)

      for (const charge of charges ?? []) {
        const lesson = (lessons ?? []).find((l) => l.id === charge.lesson_id)
        if (lesson?.teacher_id) {
          revenueByTeacher[lesson.teacher_id] =
            (revenueByTeacher[lesson.teacher_id] ?? 0) + (charge.amount ?? 0)
        }
      }
    }
  }

  // Fetch distinct student counts per teacher
  let studentCountByTeacher: Record<string, number> = {}
  if (lessonIds.length > 0) {
    const BATCH_SIZE = 200
    for (let i = 0; i < lessonIds.length; i += BATCH_SIZE) {
      const batch = lessonIds.slice(i, i + BATCH_SIZE)
      const { data: lessonStudents, error: lsError } = await supabase
        .from('lesson_students')
        .select('lesson_id, student_id')
        .in('lesson_id', batch)

      if (lsError) throw new Error(`Failed to fetch lesson_students: ${lsError.message}`)

      // Map lesson_id → teacher_id, then collect distinct students per teacher
      const teacherStudents: Record<string, Set<string>> = {}
      for (const ls of lessonStudents ?? []) {
        const lesson = (lessons ?? []).find((l) => l.id === ls.lesson_id)
        if (lesson?.teacher_id) {
          if (!teacherStudents[lesson.teacher_id]) {
            teacherStudents[lesson.teacher_id] = new Set()
          }
          teacherStudents[lesson.teacher_id].add(ls.student_id)
        }
      }

      for (const [teacherId, students] of Object.entries(teacherStudents)) {
        studentCountByTeacher[teacherId] =
          (studentCountByTeacher[teacherId] ?? 0) + students.size
      }
    }

    // Deduplicate across batches — re-fetch all at once for accurate distinct count
    // For simplicity, if only one batch was needed the count is already accurate.
    // For multiple batches we need a full pass:
    if (lessonIds.length > BATCH_SIZE) {
      studentCountByTeacher = {}
      const teacherStudentSets: Record<string, Set<string>> = {}
      for (let i = 0; i < lessonIds.length; i += BATCH_SIZE) {
        const batch = lessonIds.slice(i, i + BATCH_SIZE)
        const { data: lessonStudents } = await supabase
          .from('lesson_students')
          .select('lesson_id, student_id')
          .in('lesson_id', batch)

        for (const ls of lessonStudents ?? []) {
          const lesson = (lessons ?? []).find((l) => l.id === ls.lesson_id)
          if (lesson?.teacher_id) {
            if (!teacherStudentSets[lesson.teacher_id]) {
              teacherStudentSets[lesson.teacher_id] = new Set()
            }
            teacherStudentSets[lesson.teacher_id].add(ls.student_id)
          }
        }
      }
      for (const [teacherId, students] of Object.entries(teacherStudentSets)) {
        studentCountByTeacher[teacherId] = students.size
      }
    }
  }

  // Group lessons by teacher
  const teacherMap: Record<
    string,
    {
      teacherName: string
      delivered: number
      cancelled: number
      noShow: number
      monthlyMap: Record<string, { delivered: number; cancelled: number }>
    }
  > = {}

  for (const lesson of lessons ?? []) {
    const teacherId = lesson.teacher_id
    if (!teacherId) continue

    if (!teacherMap[teacherId]) {
      const teacherProfile = (lesson.teachers as any)?.profiles
      const name = teacherProfile?.full_name ?? 'Unknown'
      teacherMap[teacherId] = {
        teacherName: name,
        delivered: 0,
        cancelled: 0,
        noShow: 0,
        monthlyMap: {},
      }
    }

    const entry = teacherMap[teacherId]
    const lessonMonth = DateTime.fromISO(lesson.start_at).setZone(timezone).toFormat('yyyy-MM')

    if (!entry.monthlyMap[lessonMonth]) {
      entry.monthlyMap[lessonMonth] = { delivered: 0, cancelled: 0 }
    }

    if (lesson.status === 'completed') {
      entry.delivered++
      entry.monthlyMap[lessonMonth].delivered++
    } else if (lesson.status === 'cancelled') {
      entry.cancelled++
      entry.monthlyMap[lessonMonth].cancelled++
    } else if (lesson.status === 'no_show') {
      entry.noShow++
    }
  }

  // Build rows
  const teachers: TeacherPerformanceRow[] = Object.entries(teacherMap).map(
    ([teacherId, data]) => {
      const total = data.delivered + data.cancelled + data.noShow
      const cancellationRate = total > 0 ? (data.cancelled / total) * 100 : 0

      const monthlyBreakdown = Object.entries(data.monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, counts]) => ({
          month,
          delivered: counts.delivered,
          cancelled: counts.cancelled,
        }))

      return {
        teacherId,
        teacherName: data.teacherName,
        lessonsDelivered: data.delivered,
        lessonsCancelled: data.cancelled,
        cancellationRate: Math.round(cancellationRate * 100) / 100,
        noShowCount: data.noShow,
        revenue: revenueByTeacher[teacherId] ?? 0,
        studentCount: studentCountByTeacher[teacherId] ?? 0,
        avgMonthlyLessons: Math.round((data.delivered / months) * 100) / 100,
        monthlyBreakdown,
      }
    }
  )

  // Org averages
  const teacherCount = teachers.length || 1
  const orgAverages = {
    avgLessonsDelivered:
      Math.round(
        (teachers.reduce((sum, t) => sum + t.lessonsDelivered, 0) / teacherCount) * 100
      ) / 100,
    avgCancellationRate:
      Math.round(
        (teachers.reduce((sum, t) => sum + t.cancellationRate, 0) / teacherCount) * 100
      ) / 100,
    avgRevenue:
      Math.round((teachers.reduce((sum, t) => sum + t.revenue, 0) / teacherCount) * 100) / 100,
  }

  return { teachers, orgAverages }
}
