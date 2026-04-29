import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface StudentLtv {
  totalPaid: number
  monthsActive: number
  avgMonthlyValue: number
  firstLessonAt: string | null
  lastLessonAt: string | null
  totalLessons: number
}

export async function getStudentLtv(studentId: string, orgId: string): Promise<StudentLtv> {
  const supabase = createServiceRoleClient()

  // Get the student record for created_at
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('created_at')
    .eq('id', studentId)
    .eq('organization_id', orgId)
    .single()

  if (studentError) throw new Error(`Failed to fetch student: ${studentError.message}`)

  // Get all lesson_students entries to find lesson IDs
  const { data: lessonStudents, error: lsError } = await supabase
    .from('lesson_students')
    .select('lesson_id')
    .eq('student_id', studentId)

  if (lsError) throw new Error(`Failed to fetch lesson_students: ${lsError.message}`)

  const lessonIds = (lessonStudents ?? []).map((ls) => ls.lesson_id)

  let totalPaid = 0
  let firstLessonAt: string | null = null
  let lastLessonAt: string | null = null
  let totalLessons = 0

  if (lessonIds.length > 0) {
    // Get lesson details for first/last and total count
    const BATCH_SIZE = 200
    let allLessonDates: string[] = []

    for (let i = 0; i < lessonIds.length; i += BATCH_SIZE) {
      const batch = lessonIds.slice(i, i + BATCH_SIZE)
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('start_at')
        .eq('organization_id', orgId)
        .eq('status', 'completed')
        .in('id', batch)

      if (lessonsError) throw new Error(`Failed to fetch lessons: ${lessonsError.message}`)
      allLessonDates.push(...(lessons ?? []).map((l) => l.start_at))
    }

    totalLessons = allLessonDates.length

    if (allLessonDates.length > 0) {
      allLessonDates.sort()
      firstLessonAt = allLessonDates[0]
      lastLessonAt = allLessonDates[allLessonDates.length - 1]
    }

    // Sum paid charges linked to these lessons
    for (let i = 0; i < lessonIds.length; i += BATCH_SIZE) {
      const batch = lessonIds.slice(i, i + BATCH_SIZE)
      const { data: charges, error: chargesError } = await supabase
        .from('charges')
        .select('amount')
        .eq('organization_id', orgId)
        .eq('status', 'paid')
        .in('lesson_id', batch)

      if (chargesError) throw new Error(`Failed to fetch charges: ${chargesError.message}`)
      totalPaid += (charges ?? []).reduce((sum, c) => sum + (c.amount ?? 0), 0)
    }
  }

  // Also include charges from student_monthly_billing
  const { data: monthlyCharges, error: monthlyError } = await supabase
    .from('student_monthly_billing')
    .select('charge_id, charges!inner(amount, status)')
    .eq('student_id', studentId)
    .eq('organization_id', orgId)
    .eq('charges.status', 'paid')

  if (!monthlyError && monthlyCharges) {
    for (const record of monthlyCharges) {
      const charge = record.charges as any
      if (charge?.amount) {
        totalPaid += charge.amount
      }
    }
  }

  // Calculate months active
  const createdAt = DateTime.fromISO(student.created_at)
  const now = DateTime.now()
  const monthsActive = Math.max(Math.floor(now.diff(createdAt, 'months').months), 1)

  const avgMonthlyValue = Math.round((totalPaid / monthsActive) * 100) / 100

  return {
    totalPaid,
    monthsActive,
    avgMonthlyValue,
    firstLessonAt,
    lastLessonAt,
    totalLessons,
  }
}
