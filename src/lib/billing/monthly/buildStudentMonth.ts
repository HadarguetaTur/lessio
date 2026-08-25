import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveBillingParent } from '@/lib/billing/resolveBillingParent'
import type {
  LessonRow,
  SubscriptionRow,
  CancellationEventRow,
  MonthlyBillingRow,
  BillingResult,
  MissingFieldsError,
} from './types'
import { isMissingFieldsError, round2 } from './types'
import { calculateLessonsContribution } from './lessonAmount'
import { calculateCancellationsContribution } from './cancellations'
import { calculateSubscriptionsContribution } from './subscriptions'
import { getBillingMonthRange } from './month'
import { syncMonthlyCharge } from './syncMonthlyCharge'
import { getOrgPricing, type OrgPricing } from '@/lib/organizations/pricing'

interface PrefetchedData {
  lessons: LessonRow[]
  cancellations: CancellationEventRow[]
  subscriptions: SubscriptionRow[]
  existingBilling: MonthlyBillingRow | null
  /** Number of students per lesson (for multi-student individual detection) */
  studentCountByLesson: Map<string, number>
  /** Org lesson price defaults — fetched once by the bulk runner. */
  pricing: OrgPricing
}

function assertNoQueryError(
  operation: string,
  error: { message: string } | null
) {
  if (error) {
    throw new Error(`[buildStudentMonth] ${operation}: ${error.message}`)
  }
}

/**
 * Build a billing record for one student for one month (spec §8).
 *
 * When `prefetched` is provided the engine skips DB fetches and uses the
 * pre-built data (used by the bulk runner). Otherwise it fetches everything
 * from the DB.
 */
export async function buildStudentMonth(
  organizationId: string,
  studentId: string,
  billingMonth: string,
  timezone: string,
  prefetched?: PrefetchedData
): Promise<BillingResult | MissingFieldsError | 'skipped'> {
  const supabase = createServiceRoleClient()

  // ── Fetch or use prefetched data ─────────────────────────────────────────

  let lessons: LessonRow[]
  let cancellations: CancellationEventRow[]
  let subscriptions: SubscriptionRow[]
  let existingBilling: MonthlyBillingRow | null
  let studentCountByLesson: Map<string, number>
  let pricing: OrgPricing

  if (prefetched) {
    lessons = prefetched.lessons
    cancellations = prefetched.cancellations
    subscriptions = prefetched.subscriptions
    existingBilling = prefetched.existingBilling
    studentCountByLesson = prefetched.studentCountByLesson
    pricing = prefetched.pricing
  } else {
    pricing = await getOrgPricing(organizationId)

    const { monthStartUTC, monthEndUTC } = getBillingMonthRange(
      billingMonth,
      timezone
    )

    // Fetch lessons for this student in this month
    const { data: lessonData, error: lessonError } = await supabase
      .from('lessons')
      .select(
        'id, start_at, end_at, status, lesson_type, price_per_student, teachers(id, hourly_rate), lesson_students!inner(student_id)'
      )
      .eq('organization_id', organizationId)
      .eq('lesson_students.student_id', studentId)
      .gte('start_at', monthStartUTC)
      .lt('start_at', monthEndUTC)
    assertNoQueryError('load lessons', lessonError)

    // Build student counts per lesson
    studentCountByLesson = new Map()
    if (lessonData) {
      const lessonIds = lessonData.map((l) => l.id)
      if (lessonIds.length > 0) {
        const { data: allLs, error: lessonStudentsError } = await supabase
          .from('lesson_students')
          .select('lesson_id')
          .in('lesson_id', lessonIds)
        assertNoQueryError('load lesson student counts', lessonStudentsError)

        for (const row of allLs ?? []) {
          const lid = row.lesson_id as string
          studentCountByLesson.set(lid, (studentCountByLesson.get(lid) ?? 0) + 1)
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lessons = (lessonData ?? []).map((l: any) => ({
      id: l.id,
      start_at: l.start_at,
      end_at: l.end_at,
      status: l.status,
      lesson_type: l.lesson_type ?? 'individual',
      price_per_student: l.price_per_student ?? null,
      teacher: l.teachers as { id: string; hourly_rate: number | null },
    }))

    // Fetch cancellation events
    const { data: cancelData, error: cancelError } = await supabase
      .from('student_cancellation_events')
      .select('id, lesson_id, student_id, cancellation_date, hours_before, is_lt_24h, is_charged, charge_override, billing_month')
      .eq('organization_id', organizationId)
      .eq('student_id', studentId)
      .eq('billing_month', billingMonth)
    assertNoQueryError('load cancellation events', cancelError)

    cancellations = (cancelData ?? []) as CancellationEventRow[]

    // Fetch subscriptions
    const { data: subData, error: subError } = await supabase
      .from('subscriptions')
      .select('id, organization_id, student_id, subscription_type, monthly_amount, start_date, end_date, is_paused, pause_date')
      .eq('organization_id', organizationId)
      .eq('student_id', studentId)
    assertNoQueryError('load subscriptions', subError)

    subscriptions = (subData ?? []) as SubscriptionRow[]

    // Fetch existing billing record
    const { data: billingData, error: billingError } = await supabase
      .from('student_monthly_billing')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('student_id', studentId)
      .eq('billing_month', billingMonth)
      .maybeSingle()
    assertNoQueryError('load existing billing record', billingError)

    existingBilling = billingData as MonthlyBillingRow | null
  }

  // ── Build cancelledLessonIds set (spec §5.2) ─────────────────────────────

  const cancelledLessonIds = new Set(cancellations.map((c) => c.lesson_id))

  // ── Calculate contributions ──────────────────────────────────────────────

  const lessonsResult = calculateLessonsContribution(
    lessons,
    billingMonth,
    studentId,
    subscriptions,
    timezone,
    cancelledLessonIds,
    studentCountByLesson,
    pricing
  )
  if (isMissingFieldsError(lessonsResult)) return lessonsResult

  // Build lesson lookup for cancellation amount resolution
  const lessonLookup = new Map<string, LessonRow>()
  for (const l of lessons) lessonLookup.set(l.id, l)

  const cancellationsResult = calculateCancellationsContribution(
    cancellations,
    lessonLookup,
    subscriptions,
    timezone,
    pricing
  )
  if (isMissingFieldsError(cancellationsResult)) return cancellationsResult

  const subscriptionsResult = calculateSubscriptionsContribution(
    subscriptions,
    billingMonth
  )
  if (isMissingFieldsError(subscriptionsResult)) return subscriptionsResult

  // ── NO_BILLABLE_DATA check (spec §4.5) ───────────────────────────────────

  if (
    lessonsResult.lessonsCount === 0 &&
    cancellationsResult.cancellationsCount === 0 &&
    subscriptionsResult.activeSubscriptionsCount === 0
  ) {
    return 'skipped'
  }

  // ── Calculate total ──────────────────────────────────────────────────────

  const computedTotal = round2(
    lessonsResult.lessonsTotal +
      cancellationsResult.cancellationsTotal +
      subscriptionsResult.subscriptionsTotal
  )

  const manualAdjustment = existingBilling?.manual_adjustment_amount ?? 0
  const totalAmount = round2(computedTotal + Number(manualAdjustment))
  const isApproved = cancellationsResult.pendingCancellationsCount === 0

  // Resolve billing parent
  let parentId: string | null = existingBilling?.parent_id ?? null
  try {
    parentId = await resolveBillingParent(studentId, organizationId)
  } catch {
    // No primary parent — still create the billing record, just without parent_id
  }

  // ── Upsert (spec §7.3) ──────────────────────────────────────────────────

  const record = {
    organization_id: organizationId,
    student_id: studentId,
    parent_id: parentId,
    billing_month: billingMonth,
    is_paid: existingBilling?.is_paid ?? false,
    is_approved: isApproved,
    lessons_amount: lessonsResult.lessonsTotal,
    subscriptions_amount: subscriptionsResult.subscriptionsTotal,
    cancellations_amount: cancellationsResult.cancellationsTotal,
    total_amount: totalAmount,
    lessons_count: lessonsResult.lessonsCount,
    // Preserve manual adjustment fields
    manual_adjustment_amount: existingBilling?.manual_adjustment_amount ?? null,
    manual_adjustment_reason: existingBilling?.manual_adjustment_reason ?? null,
    manual_adjustment_date: existingBilling?.manual_adjustment_date ?? null,
    updated_at: new Date().toISOString(),
  }

  let persistedBilling: MonthlyBillingRow
  if (existingBilling) {
    const { data: updatedBilling, error: updateError } = await supabase
      .from('student_monthly_billing')
      .update(record)
      .eq('id', existingBilling.id)
      .select('*')
      .single()
    assertNoQueryError('update billing record', updateError)
    persistedBilling = updatedBilling as MonthlyBillingRow
  } else {
    const { data: insertedBilling, error: insertError } = await supabase
      .from('student_monthly_billing')
      .insert(record)
      .select('*')
      .single()
    assertNoQueryError('insert billing record', insertError)
    persistedBilling = insertedBilling as MonthlyBillingRow
  }

  const syncedCharge = await syncMonthlyCharge({
    organizationId,
    billingRecordId: persistedBilling.id,
    parentId: persistedBilling.parent_id,
    billingMonth,
    amount: totalAmount,
    isApproved,
    isPaid: persistedBilling.is_paid,
    paidAtHint: persistedBilling.is_paid
      ? persistedBilling.updated_at ?? persistedBilling.created_at
      : null,
  })

  if (syncedCharge.isPaid !== persistedBilling.is_paid) {
    const { error: syncBillingError } = await supabase
      .from('student_monthly_billing')
      .update({
        is_paid: syncedCharge.isPaid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', persistedBilling.id)
      .eq('organization_id', organizationId)
    assertNoQueryError('sync billing paid state from charge ledger', syncBillingError)
  }

  return {
    studentId,
    billingMonth,
    lessonsAmount: lessonsResult.lessonsTotal,
    subscriptionsAmount: subscriptionsResult.subscriptionsTotal,
    cancellationsAmount: cancellationsResult.cancellationsTotal,
    totalAmount,
    lessonsCount: lessonsResult.lessonsCount,
    isApproved,
  }
}
