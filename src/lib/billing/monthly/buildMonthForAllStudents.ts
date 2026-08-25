import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  LessonRow,
  SubscriptionRow,
  CancellationEventRow,
  MonthlyBillingRow,
  BuildMonthResult,
  MissingFieldsError,
} from './types'
import { isMissingFieldsError } from './types'
import { buildStudentMonth } from './buildStudentMonth'
import { getBillingMonthRange } from './month'
import { getOrgPricing } from '@/lib/organizations/pricing'

function assertNoQueryError(
  operation: string,
  error: { message: string } | null
) {
  if (error) {
    throw new Error(`[buildMonthForAllStudents] ${operation}: ${error.message}`)
  }
}

/**
 * Bulk run: generate billing for all active students in an org for a month.
 * Pre-fetches all data in 5 queries, groups by student, then calls
 * buildStudentMonth per student with prefetched data (spec §8.1).
 */
export async function buildMonthForAllStudents(
  organizationId: string,
  billingMonth: string,
  timezone: string
): Promise<BuildMonthResult> {
  const supabase = createServiceRoleClient()

  const { monthStartUTC, monthEndUTC } = getBillingMonthRange(
    billingMonth,
    timezone
  )

  // ── 5 bulk queries ───────────────────────────────────────────────────────

  const [studentsRes, lessonsRes, cancelRes, subsRes, billingRes] =
    await Promise.all([
      supabase
        .from('students')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      supabase
        .from('lessons')
        .select(
          'id, start_at, end_at, status, lesson_type, price_per_student, teachers(id, hourly_rate), lesson_students(student_id)'
        )
        .eq('organization_id', organizationId)
        .gte('start_at', monthStartUTC)
        .lt('start_at', monthEndUTC),
      supabase
        .from('student_cancellation_events')
        .select(
          'id, lesson_id, student_id, cancellation_date, hours_before, is_lt_24h, is_charged, charge_override, billing_month'
        )
        .eq('organization_id', organizationId)
        .eq('billing_month', billingMonth),
      supabase
        .from('subscriptions')
        .select(
          'id, organization_id, student_id, subscription_type, monthly_amount, start_date, end_date, is_paused, pause_date'
        )
        .eq('organization_id', organizationId),
      supabase
        .from('student_monthly_billing')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('billing_month', billingMonth),
    ])

  assertNoQueryError('load students', studentsRes.error)
  assertNoQueryError('load lessons', lessonsRes.error)
  assertNoQueryError('load cancellation events', cancelRes.error)
  assertNoQueryError('load subscriptions', subsRes.error)
  assertNoQueryError('load existing monthly billing', billingRes.error)

  const students = (studentsRes.data ?? []) as Array<{ id: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allLessons: LessonRow[] = (lessonsRes.data ?? []).map((l: any) => ({
    id: l.id,
    start_at: l.start_at,
    end_at: l.end_at,
    status: l.status,
    lesson_type: l.lesson_type ?? 'individual',
    price_per_student: l.price_per_student ?? null,
    teacher: l.teachers as { id: string; hourly_rate: number | null },
  }))
  const allCancellations = (cancelRes.data ?? []) as CancellationEventRow[]
  const allSubscriptions = (subsRes.data ?? []) as SubscriptionRow[]
  const allBillings = (billingRes.data ?? []) as MonthlyBillingRow[]

  // ── Group by student ─────────────────────────────────────────────────────

  // Build lesson_students mapping: lessonId → studentIds
  const lessonStudentMap = new Map<string, Set<string>>()
  for (const l of lessonsRes.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ls = (l as any).lesson_students as Array<{ student_id: string }> | null
    if (ls) {
      const ids = new Set(ls.map((r) => r.student_id))
      lessonStudentMap.set(l.id, ids)
    }
  }

  // Student counts per lesson
  const studentCountByLesson = new Map<string, number>()
  for (const [lid, sids] of lessonStudentMap) {
    studentCountByLesson.set(lid, sids.size)
  }

  // Lessons grouped by studentId
  const lessonsByStudent = new Map<string, LessonRow[]>()
  for (const lesson of allLessons) {
    const studentIds = lessonStudentMap.get(lesson.id)
    if (!studentIds) continue
    for (const sid of studentIds) {
      const arr = lessonsByStudent.get(sid) ?? []
      arr.push(lesson)
      lessonsByStudent.set(sid, arr)
    }
  }

  // Cancellations by student
  const cancelByStudent = new Map<string, CancellationEventRow[]>()
  for (const c of allCancellations) {
    const arr = cancelByStudent.get(c.student_id) ?? []
    arr.push(c)
    cancelByStudent.set(c.student_id, arr)
  }

  // Subscriptions by student
  const subsByStudent = new Map<string, SubscriptionRow[]>()
  for (const s of allSubscriptions) {
    const arr = subsByStudent.get(s.student_id) ?? []
    arr.push(s)
    subsByStudent.set(s.student_id, arr)
  }

  // Existing billing by student
  const billingByStudent = new Map<string, MonthlyBillingRow>()
  for (const b of allBillings) {
    billingByStudent.set(b.student_id, b)
  }

  // ── Process each student ─────────────────────────────────────────────────

  // Org price defaults are the same for every student — fetch once.
  const pricing = await getOrgPricing(organizationId)

  const result: BuildMonthResult = { success: [], errors: [], skipped: [] }

  for (const student of students) {
    const sid = student.id
    const prefetched = {
      lessons: lessonsByStudent.get(sid) ?? [],
      cancellations: cancelByStudent.get(sid) ?? [],
      subscriptions: subsByStudent.get(sid) ?? [],
      existingBilling: billingByStudent.get(sid) ?? null,
      studentCountByLesson,
      pricing,
    }

    try {
      const res = await buildStudentMonth(
        organizationId,
        sid,
        billingMonth,
        timezone,
        prefetched
      )

      if (res === 'skipped') {
        result.skipped.push(sid)
      } else if (isMissingFieldsError(res)) {
        result.errors.push({ studentId: sid, error: res as MissingFieldsError })
      } else {
        result.success.push(res)
      }
    } catch (err) {
      result.errors.push({
        studentId: sid,
        error: {
          MISSING_FIELDS: [
            {
              table: 'unknown',
              field: 'unknown',
              why_needed: err instanceof Error ? err.message : String(err),
              example_values: [],
            },
          ],
        },
      })
    }
  }

  return result
}
