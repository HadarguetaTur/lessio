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
import { getBillingMonthRange, getBillingPeriodDates } from './month'
import { syncMonthlyCharge } from './syncMonthlyCharge'
import { getOrgPricing, type OrgPricing } from '@/lib/organizations/pricing'
import { toStudentPricing, type StudentPricing } from '@/lib/billing/lessonPricing'
import type { LessonOutcomeContext } from './lessonAmount'
import { calculatePacksContribution, PACK_SALE_COLUMNS, type PackSaleRow } from './packs'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { DEFAULT_COLLECTION_POLICY } from '@/lib/cancellation-policy/collection'

const PACK_PAID_KINDS = ['consume_lesson', 'consume_no_show']

/** One student's attendance, punches and pack sales for the lessons of a month. */
async function loadOutcomes(
  organizationId: string,
  studentId: string,
  billingMonth: string,
  lessonIds: string[]
): Promise<{ outcomes: LessonOutcomeContext; packsSold: PackSaleRow[] }> {
  const supabase = createServiceRoleClient()
  const [attendanceRes, usesRes, packsRes, collection] = await Promise.all([
    lessonIds.length
      ? supabase
          .from('lesson_students')
          .select('lesson_id, attendance, absence_amount')
          .eq('student_id', studentId)
          .in('lesson_id', lessonIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? supabase
          .from('lesson_pack_ledger')
          .select('lesson_id')
          .eq('organization_id', organizationId)
          .eq('student_id', studentId)
          .is('reversed_at', null)
          .in('kind', PACK_PAID_KINDS)
          .in('lesson_id', lessonIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('lesson_packs')
      .select(PACK_SALE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('billing_student_id', studentId)
      .eq('sold_billing_month', billingMonth)
      .is('cancelled_at', null)
      .is('charge_id', null),
    getCollectionPolicyServiceRole(organizationId),
  ])
  assertNoQueryError('load attendance', attendanceRes.error)
  assertNoQueryError('load pack uses', usesRes.error)
  assertNoQueryError('load pack sales', packsRes.error)

  type AttendanceRow = { lesson_id: string; attendance: string | null; absence_amount: number | string | null }
  return {
    outcomes: {
      attendanceByLesson: new Map(
        ((attendanceRes.data ?? []) as AttendanceRow[]).map((r) => [r.lesson_id, r])
      ),
      packUseLessonIds: new Set(((usesRes.data ?? []) as Array<{ lesson_id: string }>).map((r) => r.lesson_id)),
      collection,
    },
    packsSold: (packsRes.data ?? []) as unknown as PackSaleRow[],
  }
}

export interface PrefetchedData {
  lessons: LessonRow[]
  cancellations: CancellationEventRow[]
  subscriptions: SubscriptionRow[]
  existingBilling: MonthlyBillingRow | null
  /** Number of students per lesson (for multi-student individual detection) */
  studentCountByLesson: Map<string, number>
  /** Org lesson price defaults — fetched once by the bulk runner. */
  pricing: OrgPricing
  /** This student's personal rate and discount (students.hourly_rate / discount_percent). */
  studentPricing: StudentPricing
  /** Attendance, punches and the no-show policy (decision #46). */
  outcomes?: LessonOutcomeContext
  /** Pack sales carried on this student's bill. */
  packsSold?: PackSaleRow[]
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
  prefetched?: PrefetchedData,
  cycleStartDay = 1,
  dueDays = 7
): Promise<BillingResult | MissingFieldsError | 'skipped'> {
  const supabase = createServiceRoleClient()

  // ── Fetch or use prefetched data ─────────────────────────────────────────

  let lessons: LessonRow[]
  let cancellations: CancellationEventRow[]
  let subscriptions: SubscriptionRow[]
  let existingBilling: MonthlyBillingRow | null
  let studentCountByLesson: Map<string, number>
  let pricing: OrgPricing
  let studentPricing: StudentPricing
  let outcomes: LessonOutcomeContext
  let packsSold: PackSaleRow[]

  if (prefetched) {
    lessons = prefetched.lessons
    cancellations = prefetched.cancellations
    subscriptions = prefetched.subscriptions
    existingBilling = prefetched.existingBilling
    studentCountByLesson = prefetched.studentCountByLesson
    pricing = prefetched.pricing
    studentPricing = prefetched.studentPricing
    outcomes = prefetched.outcomes ?? {
      attendanceByLesson: new Map(),
      packUseLessonIds: new Set(),
      collection: DEFAULT_COLLECTION_POLICY,
    }
    packsSold = prefetched.packsSold ?? []
  } else {
    pricing = await getOrgPricing(organizationId)

    const { data: studentRow, error: studentError } = await supabase
      .from('students')
      .select('hourly_rate, discount_percent')
      .eq('id', studentId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    assertNoQueryError('load student pricing', studentError)
    studentPricing = toStudentPricing(studentRow)

    const { monthStartUTC, monthEndUTC } = getBillingMonthRange(
      billingMonth,
      timezone,
      cycleStartDay
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
      .select('id, lesson_id, student_id, cancellation_date, hours_before, is_lt_24h, is_charged, charge_override, policy_amount, billing_month')
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

    const loaded = await loadOutcomes(organizationId, studentId, billingMonth, lessons.map((l) => l.id))
    outcomes = loaded.outcomes
    packsSold = loaded.packsSold
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
    pricing,
    cycleStartDay,
    studentPricing,
    outcomes
  )
  if (isMissingFieldsError(lessonsResult)) return lessonsResult

  const packsResult = calculatePacksContribution(packsSold, billingMonth)

  // Build lesson lookup for cancellation amount resolution
  const lessonLookup = new Map<string, LessonRow>()
  for (const l of lessons) lessonLookup.set(l.id, l)

  const cancellationsResult = calculateCancellationsContribution(
    cancellations,
    lessonLookup,
    subscriptions,
    timezone,
    pricing,
    studentPricing
  )
  if (isMissingFieldsError(cancellationsResult)) return cancellationsResult

  const periodDates = getBillingPeriodDates(billingMonth, timezone, cycleStartDay)
  const subscriptionsResult = calculateSubscriptionsContribution(
    subscriptions,
    billingMonth,
    periodDates.periodStart,
    periodDates.periodEnd
  )
  if (isMissingFieldsError(subscriptionsResult)) return subscriptionsResult

  // ── NO_BILLABLE_DATA check (spec §4.5) ───────────────────────────────────

  if (
    lessonsResult.lessonsCount === 0 &&
    lessonsResult.noShowCount === 0 &&
    cancellationsResult.cancellationsCount === 0 &&
    subscriptionsResult.activeSubscriptionsCount === 0 &&
    packsResult.packsCount === 0
  ) {
    return 'skipped'
  }

  // ── Calculate total ──────────────────────────────────────────────────────

  const computedTotal = round2(
    lessonsResult.lessonsTotal +
      lessonsResult.noShowTotal +
      cancellationsResult.cancellationsTotal +
      subscriptionsResult.subscriptionsTotal +
      packsResult.packsTotal
  )

  const manualAdjustment = existingBilling?.manual_adjustment_amount ?? 0
  const totalAmount = round2(computedTotal + Number(manualAdjustment))
  // Generation creates a reviewable draft. Money enters the charge ledger only
  // through the explicit approval action. Preserve approval on an existing row;
  // recalculation must not silently demote a bill that was already approved.
  const isApproved = existingBilling?.is_approved ?? false

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
    period_start: periodDates.periodStart,
    period_end: periodDates.periodEnd,
    is_paid: existingBilling?.is_paid ?? false,
    is_approved: isApproved,
    lessons_amount: lessonsResult.lessonsTotal,
    subscriptions_amount: subscriptionsResult.subscriptionsTotal,
    cancellations_amount: cancellationsResult.cancellationsTotal,
    total_amount: totalAmount,
    lessons_count: lessonsResult.lessonsCount,
    no_show_amount: lessonsResult.noShowTotal,
    no_show_count: lessonsResult.noShowCount,
    packs_amount: packsResult.packsTotal,
    packs_count: packsResult.packsCount,
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
    periodEnd: persistedBilling.period_end,
    dueDays,
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
    noShowAmount: lessonsResult.noShowTotal,
    packsAmount: packsResult.packsTotal,
    totalAmount,
    lessonsCount: lessonsResult.lessonsCount,
    isApproved,
  }
}
