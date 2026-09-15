import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgPricing, type OrgPricing } from '@/lib/organizations/pricing'
import { getCancellationPolicyServiceRole } from '@/lib/cancellation-policy/service'
import type { CancellationPolicy } from '@/lib/cancellation-policy'
import { calculateCancellationCharge } from '@/lib/billing/calculateCancellationCharge'
import {
  isLessonCoveredBySubscription,
  isMissingPrice,
  resolveLessonBaseAmount,
  toStudentPricing,
} from '@/lib/billing/lessonPricing'
import { checkActiveSubscriptionForLesson, type CoverageSubscription } from '@/lib/billing/monthly/subscriptions'
import {
  calculateTeacherEconomics,
  type AttentionCounts,
  type CancellationActor,
  type CompensationPolicy,
  type ConfirmationState,
  type EconomicsLesson,
  type EstimateLine,
  type LineWarning,
  type RevenueBasis,
} from './calculator'

export interface OperationalTeacherReport {
  teacherId: string
  teacherName: string
  completedCount: number
  noShowCount: number
  cancelledCount: number
  scheduledCount: number
  deliveryHours: number
}

export interface OwnerTeacherEconomicsReport extends OperationalTeacherReport {
  attributedRevenue: number
  estimatedCompensation: number | null
  contribution: number | null
  contributionRate: number | null
  confirmationState: ConfirmationState
  attention: AttentionCounts
  missingPolicyWarnings: string[]
  estimateLines: EstimateLine[]
}

export interface TeacherPersonalEstimate extends OperationalTeacherReport {
  estimatedCompensation: number | null
  confirmationState: ConfirmationState
}

type StudentJoin = {
  full_name?: string | null
  hourly_rate?: number | string | null
  discount_percent?: number | string | null
}

type OwnerLessonRow = {
  id: string
  teacher_id: string
  status: EconomicsLesson['status']
  start_at: string
  end_at: string
  lesson_type: EconomicsLesson['lessonType'] | null
  price_per_student: number | string | null
  cancelled_at: string | null
  cancellation_source: string | null
  delivery_confirmed_at: string | null
  delivery_confirmation_source: EconomicsLesson['deliveryConfirmationSource']
  lesson_students: Array<{ student_id: string; students: StudentJoin | StudentJoin[] | null }>
  teachers: unknown
  charges: Array<{ amount: number | string | null; charge_type: string | null; status: string | null }>
}

const OWNER_SELECT =
  'id, teacher_id, status, start_at, end_at, lesson_type, price_per_student, cancelled_at, cancellation_source, delivery_confirmed_at, delivery_confirmation_source, ' +
  'lesson_students(student_id, students(full_name, hourly_rate, discount_percent)), teachers(hourly_rate, profiles(full_name)), charges(amount, charge_type, status)'

function monthBounds(month: string, timezone: string): { start: string; end: string } {
  const start = DateTime.fromFormat(month, 'yyyy-MM', { zone: timezone }).startOf('month')
  if (!start.isValid) throw new Error('INVALID_MONTH')
  return { start: start.toUTC().toISO()!, end: start.plus({ months: 1 }).toUTC().toISO()! }
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function teacherName(row: unknown): string {
  const value = row as { profiles?: { full_name?: string } | { full_name?: string }[] | null } | null
  return one(value?.profiles)?.full_name ?? '—'
}

function teacherHourlyRate(row: unknown): number | null {
  const value = row as { hourly_rate?: number | string | null } | null
  return value?.hourly_rate == null ? null : Number(value.hourly_rate)
}

/** Maps `lessons.cancellation_source` onto the calculator's actor. Portal and WhatsApp are the parent's own channels. */
export function cancellationActorFromSource(source: string | null | undefined): CancellationActor {
  switch (source) {
    case 'parent':
    case 'portal':
    case 'whatsapp':
      return 'parent'
    case 'teacher':
      return 'teacher'
    case 'staff':
      return 'staff'
    default:
      return 'unknown'
  }
}

function operationRows(lessons: readonly { teacher_id: string; status: string; start_at: string; end_at: string; teachers: unknown }[]): OperationalTeacherReport[] {
  const byTeacher = new Map<string, OperationalTeacherReport>()
  for (const lesson of lessons) {
    const existing = byTeacher.get(lesson.teacher_id) ?? {
      teacherId: lesson.teacher_id,
      teacherName: teacherName(lesson.teachers),
      completedCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
      scheduledCount: 0,
      deliveryHours: 0,
    }
    if (lesson.status === 'completed') existing.completedCount += 1
    else if (lesson.status === 'no_show') existing.noShowCount += 1
    else if (lesson.status === 'cancelled') existing.cancelledCount += 1
    else existing.scheduledCount += 1
    if (lesson.status !== 'scheduled') {
      existing.deliveryHours += Math.max(0, DateTime.fromISO(lesson.end_at).diff(DateTime.fromISO(lesson.start_at), 'hours').hours)
    }
    byTeacher.set(lesson.teacher_id, existing)
  }
  return [...byTeacher.values()].map((row) => ({ ...row, deliveryHours: Math.round((row.deliveryHours + Number.EPSILON) * 100) / 100 }))
}

export async function getOperationalTeacherReport(
  organizationId: string,
  month: string,
  timezone: string,
  teacherId?: string
): Promise<OperationalTeacherReport[]> {
  const { start, end } = monthBounds(month, timezone)
  const db = createServiceRoleClient()
  let query = db
    .from('lessons')
    .select('teacher_id, status, start_at, end_at, teachers(profiles(full_name))')
    .eq('organization_id', organizationId)
    .gte('start_at', start)
    .lt('start_at', end)
  if (teacherId) query = query.eq('teacher_id', teacherId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return operationRows((data ?? []) as { teacher_id: string; status: string; start_at: string; end_at: string; teachers: unknown }[])
    .sort((a, b) => b.completedCount - a.completedCount || a.teacherName.localeCompare(b.teacherName))
}

interface AttributionContext {
  pricing: OrgPricing
  cancellationPolicy: CancellationPolicy | null
  subscriptions: CoverageSubscription[]
  timezone: string
}

interface Attribution {
  attributedRevenue: number
  revenueBasis: RevenueBasis
  subscriptionCovered: boolean
  lateParentCancellation: boolean
  warnings: LineWarning[]
}

/**
 * Attributed revenue for one lesson (decision #45): the list value of the
 * activity under current pricing. Completed lessons are priced per enrolled
 * student; parent cancellations follow the cancellation policy unless a charge
 * was actually recorded; no-shows are not billed by the centre and attribute
 * nothing. Subscription coverage is flagged, never used to zero a lesson.
 */
export function attributeLessonRevenue(row: OwnerLessonRow, ctx: AttributionContext): Attribution {
  const lessonType = row.lesson_type ?? 'individual'
  const durationMinutes = Math.max(0, DateTime.fromISO(row.end_at).diff(DateTime.fromISO(row.start_at), 'minutes').minutes)
  const students = Array.isArray(row.lesson_students) ? row.lesson_students : []
  const teacherRate = teacherHourlyRate(row.teachers)
  const lessonDate = DateTime.fromISO(row.start_at, { zone: 'utc' }).setZone(ctx.timezone).toISODate() ?? row.start_at.slice(0, 10)
  const warnings: LineWarning[] = []

  const priced = students.map((entry) => {
    const student = one(entry.students)
    const pricing = toStudentPricing(student)
    const amount = resolveLessonBaseAmount(
      {
        lessonType,
        pricePerStudent: row.price_per_student == null ? null : Number(row.price_per_student),
        durationMinutes,
        teacherHourlyRate: teacherRate,
        studentHourlyRate: pricing.hourlyRate,
        studentDiscountPercent: pricing.discountPercent,
      },
      ctx.pricing
    )
    return isMissingPrice(amount) ? null : amount
  })
  const listTotal = priced.reduce<number>((sum, amount) => sum + (amount ?? 0), 0)
  if (priced.some((amount) => amount == null)) warnings.push('missing_price')

  const subscriptionCovered = students.length > 0 && students.every((entry) =>
    isLessonCoveredBySubscription(
      lessonType,
      ctx.pricing.subscriptionCoveredLessonTypes,
      checkActiveSubscriptionForLesson(entry.student_id, lessonDate, ctx.subscriptions)
    )
  )

  const none = (extra: LineWarning[] = []): Attribution => ({
    attributedRevenue: 0, revenueBasis: 'none', subscriptionCovered, lateParentCancellation: false, warnings: [...warnings, ...extra],
  })

  switch (row.status) {
    case 'completed': {
      if (students.length === 0) return none(['no_students'])
      return { attributedRevenue: listTotal, revenueBasis: 'list_price', subscriptionCovered, lateParentCancellation: false, warnings }
    }
    case 'no_show':
      return { attributedRevenue: 0, revenueBasis: 'not_billed', subscriptionCovered, lateParentCancellation: false, warnings }
    case 'cancelled': {
      const recorded = (Array.isArray(row.charges) ? row.charges : [])
        .filter((charge) => charge.charge_type === 'cancellation' && charge.status !== 'voided')
        .reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0)
      if (recorded > 0) {
        return { attributedRevenue: recorded, revenueBasis: 'cancellation_charge', subscriptionCovered, lateParentCancellation: true, warnings }
      }
      if (cancellationActorFromSource(row.cancellation_source) !== 'parent') return none()
      if (!row.cancelled_at || !ctx.cancellationPolicy) return none(['no_cancellation_policy'])
      let late = false
      let amount = 0
      for (const base of priced) {
        const charge = calculateCancellationCharge(
          { start_at: row.start_at, end_at: row.end_at, baseAmount: base },
          row.cancelled_at,
          ctx.cancellationPolicy
        )
        late = late || charge.shouldCharge
        amount += charge.amount
      }
      return { attributedRevenue: amount, revenueBasis: late ? 'cancellation_policy' : 'none', subscriptionCovered, lateParentCancellation: late, warnings }
    }
    default:
      return none()
  }
}

function toEconomicsLesson(row: OwnerLessonRow, ctx: AttributionContext): EconomicsLesson {
  const attribution = attributeLessonRevenue(row, ctx)
  const students = Array.isArray(row.lesson_students) ? row.lesson_students : []
  return {
    id: row.id,
    teacherId: row.teacher_id,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    lessonType: row.lesson_type ?? 'individual',
    enrolledStudentCount: students.length,
    studentNames: students.map((entry) => one(entry.students)?.full_name ?? '—'),
    attributedRevenue: attribution.attributedRevenue,
    revenueBasis: attribution.revenueBasis,
    subscriptionCovered: attribution.subscriptionCovered,
    cancellationActor: row.status === 'cancelled' ? cancellationActorFromSource(row.cancellation_source) : null,
    lateParentCancellation: attribution.lateParentCancellation,
    deliveryConfirmedAt: row.delivery_confirmed_at,
    deliveryConfirmationSource: row.delivery_confirmation_source,
    warnings: attribution.warnings,
  }
}

export async function getOwnerTeacherEconomicsReport(
  organizationId: string,
  month: string,
  timezone: string,
  teacherId?: string
): Promise<OwnerTeacherEconomicsReport[]> {
  const { start, end } = monthBounds(month, timezone)
  const db = createServiceRoleClient()
  let query = db
    .from('lessons')
    .select(OWNER_SELECT)
    .eq('organization_id', organizationId)
    .gte('start_at', start)
    .lt('start_at', end)
  if (teacherId) query = query.eq('teacher_id', teacherId)

  const [lessonsResult, policyResult, subscriptionResult, pricing, cancellationPolicy] = await Promise.all([
    query,
    db.from('compensation_policies').select('*').eq('organization_id', organizationId),
    db.from('subscriptions').select('student_id, start_date, end_date, is_paused').eq('organization_id', organizationId),
    getOrgPricing(organizationId),
    getCancellationPolicyServiceRole(organizationId),
  ])
  if (lessonsResult.error) throw new Error(lessonsResult.error.message)
  if (policyResult.error) throw new Error(policyResult.error.message)
  if (subscriptionResult.error) throw new Error(subscriptionResult.error.message)

  const policies: CompensationPolicy[] = (policyResult.data ?? []).map((row) => ({
    id: row.id,
    scope: row.teacher_id ? 'teacher' : 'organization',
    teacherId: row.teacher_id,
    model: row.model,
    baseRateType: row.base_rate_type,
    hourlyAmount: row.hourly_amount == null ? null : Number(row.hourly_amount),
    fixedAmount: row.fixed_amount == null ? null : Number(row.fixed_amount),
    revenuePercent: row.revenue_percent == null ? null : Number(row.revenue_percent),
    participantAmount: row.participant_amount == null ? null : Number(row.participant_amount),
    noShowPercent: Number(row.no_show_percent),
    lateParentCancellationPercent: Number(row.late_parent_cancellation_percent),
    requiresConfirmation: row.requires_confirmation,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  }))

  const ctx: AttributionContext = {
    pricing,
    cancellationPolicy,
    subscriptions: (subscriptionResult.data ?? []) as CoverageSubscription[],
    timezone,
  }
  const rows = (lessonsResult.data ?? []) as unknown as OwnerLessonRow[]
  const operations = operationRows(rows)
  const grouped = new Map<string, EconomicsLesson[]>()
  for (const row of rows) {
    const items = grouped.get(row.teacher_id) ?? []
    items.push(toEconomicsLesson(row, ctx))
    grouped.set(row.teacher_id, items)
  }

  return operations
    .map((operation) => {
      const lessons = (grouped.get(operation.teacherId) ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt))
      const result = calculateTeacherEconomics(lessons, policies, timezone)
      return {
        ...operation,
        attributedRevenue: result.attributedRevenue,
        estimatedCompensation: result.estimatedCompensation,
        contribution: result.contribution,
        contributionRate: result.contributionRate,
        confirmationState: result.confirmationState,
        attention: result.attention,
        missingPolicyWarnings: result.missingPolicyWarnings,
        estimateLines: result.lines,
      }
    })
    .sort((a, b) => (b.contribution ?? Number.NEGATIVE_INFINITY) - (a.contribution ?? Number.NEGATIVE_INFINITY) || a.teacherName.localeCompare(b.teacherName))
}

export async function getTeacherPersonalEstimate(
  organizationId: string,
  teacherId: string,
  month: string,
  timezone: string
): Promise<TeacherPersonalEstimate | null> {
  const db = createServiceRoleClient()
  const { data: org } = await db.from('organizations').select('teacher_estimates_enabled').eq('id', organizationId).single()
  if (org?.teacher_estimates_enabled !== true) return null
  const report = await getOwnerTeacherEconomicsReport(organizationId, month, timezone, teacherId)
  const row = report[0]
  if (!row) return null
  return {
    teacherId: row.teacherId,
    teacherName: row.teacherName,
    completedCount: row.completedCount,
    noShowCount: row.noShowCount,
    cancelledCount: row.cancelledCount,
    scheduledCount: row.scheduledCount,
    deliveryHours: row.deliveryHours,
    estimatedCompensation: row.estimatedCompensation ?? 0,
    confirmationState: row.confirmationState,
  }
}
