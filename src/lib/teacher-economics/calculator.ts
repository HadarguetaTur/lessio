import { DateTime } from 'luxon'

export type CompensationModel =
  | 'hourly'
  | 'fixed_per_lesson'
  | 'percentage_revenue'
  | 'base_plus_participant'

export type BaseRateType = 'hourly' | 'fixed_per_lesson'

export interface CompensationPolicy {
  id: string
  scope: 'organization' | 'teacher'
  teacherId?: string | null
  model: CompensationModel
  baseRateType?: BaseRateType | null
  hourlyAmount?: number | null
  fixedAmount?: number | null
  revenuePercent?: number | null
  participantAmount?: number | null
  noShowPercent: number
  lateParentCancellationPercent: number
  requiresConfirmation: boolean
  effectiveFrom: string
  effectiveTo?: string | null
}

export type LessonOutcome = 'scheduled' | 'completed' | 'no_show' | 'cancelled'
export type CancellationActor = 'parent' | 'teacher' | 'staff' | 'unknown' | null

/**
 * Where a lesson's attributed revenue comes from (decision #45). The number is
 * the list value of the activity, never cash: a subscription-covered lesson is
 * still attributed at list price and only flagged as covered.
 */
export type RevenueBasis =
  | 'list_price'          // completed lesson priced by resolveLessonBaseAmount per enrolled student
  | 'cancellation_charge' // a cancellation charge was actually recorded on the lesson
  | 'cancellation_policy' // parent cancellation priced by the cancellation policy window
  | 'not_billed'          // outcome the centre does not bill (student no-show)
  | 'no_show_charge'      // absences billed under the org's no-show policy (decision #46)
  | 'none'                // nothing attributable (scheduled, teacher cancellation, no students)

export type LineWarning =
  | 'missing_policy'
  | 'awaiting_confirmation'
  | 'unknown_provenance'
  | 'staff_cancellation'
  | 'missing_price'
  | 'no_cancellation_policy'
  | 'no_students'

export interface EconomicsLesson {
  id: string
  teacherId: string
  startAt: string
  endAt: string
  status: LessonOutcome
  lessonType: 'individual' | 'pair' | 'group' | 'custom'
  enrolledStudentCount: number
  attributedRevenue: number
  revenueBasis?: RevenueBasis
  subscriptionCovered?: boolean
  /** Every enrolled student's part was paid with a punch (decision #46). */
  packCovered?: boolean
  studentNames?: string[]
  cancellationActor?: CancellationActor
  lateParentCancellation?: boolean
  deliveryConfirmedAt?: string | null
  deliveryConfirmationSource?: 'teacher' | 'staff' | 'automatic' | 'unknown' | null
  /** Data-quality warnings raised while sourcing the lesson (missing price, no cancellation policy). */
  warnings?: LineWarning[]
}

export type ConfirmationState = 'confirmed' | 'estimated' | 'missing_policy'

export interface EstimateLine {
  lessonId: string
  teacherId: string
  startAt: string
  endAt: string
  outcome: LessonOutcome
  lessonType: EconomicsLesson['lessonType']
  durationHours: number
  enrolledStudentCount: number
  studentNames: string[]
  attributedRevenue: number
  revenueBasis: RevenueBasis
  subscriptionCovered: boolean
  packCovered: boolean
  cancellationActor: CancellationActor
  /** `null` when no policy covers the lesson — never silently zero. */
  estimatedCompensation: number | null
  contribution: number | null
  policyId: string | null
  policySnapshot: CompensationPolicy | null
  confirmationState: ConfirmationState
  warnings: LineWarning[]
}

export interface AttentionCounts {
  missingPolicy: number
  awaitingConfirmation: number
  unknownCancellation: number
  staffCancellation: number
  missingPrice: number
  noStudents: number
}

export interface TeacherEconomicsResult {
  deliveryCount: number
  deliveryHours: number
  attributedRevenue: number
  /** `null` when at least one delivered lesson has no policy: a partial sum would read as a real figure. */
  estimatedCompensation: number | null
  contribution: number | null
  /** contribution / attributedRevenue, `null` when there is no revenue or no contribution. */
  contributionRate: number | null
  missingPolicyWarnings: string[]
  confirmationState: ConfirmationState
  attention: AttentionCounts
  lines: EstimateLine[]
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function isActiveAt(policy: CompensationPolicy, at: DateTime): boolean {
  const from = DateTime.fromISO(policy.effectiveFrom, { zone: 'utc' })
  const to = policy.effectiveTo
    ? DateTime.fromISO(policy.effectiveTo, { zone: 'utc' })
    : null
  return from <= at && (!to || at < to)
}

export function resolveCompensationPolicy(
  policies: readonly CompensationPolicy[],
  teacherId: string,
  lessonStartAt: string,
  timezone: string
): CompensationPolicy | null {
  const localStart = DateTime.fromISO(lessonStartAt, { zone: 'utc' }).setZone(timezone)
  if (!localStart.isValid) return null

  const active = policies.filter((policy) => isActiveAt(policy, localStart.toUTC()))
  const teacherPolicy = active
    .filter((policy) => policy.scope === 'teacher' && policy.teacherId === teacherId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  if (teacherPolicy) return teacherPolicy

  return active
    .filter((policy) => policy.scope === 'organization')
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
}

function fullCompensation(
  lesson: EconomicsLesson,
  policy: CompensationPolicy,
  durationHours: number
): number {
  switch (policy.model) {
    case 'hourly':
      return durationHours * (policy.hourlyAmount ?? 0)
    case 'fixed_per_lesson':
      return policy.fixedAmount ?? 0
    case 'percentage_revenue':
      return lesson.attributedRevenue * ((policy.revenuePercent ?? 0) / 100)
    case 'base_plus_participant': {
      const base = policy.baseRateType === 'hourly'
        ? durationHours * (policy.hourlyAmount ?? 0)
        : policy.fixedAmount ?? 0
      return base + Math.max(0, lesson.enrolledStudentCount - 1) * (policy.participantAmount ?? 0)
    }
  }
}

/**
 * Outcome → share of the full compensation. Teacher and staff cancellations
 * are 0% (v1); a parent cancellation pays the late percentage only when it
 * fell inside the cancellation-policy window.
 */
function compensationPercent(lesson: EconomicsLesson, policy: CompensationPolicy): number {
  if (lesson.status === 'completed') return 100
  if (lesson.status === 'no_show') return policy.noShowPercent
  if (lesson.status === 'cancelled') {
    if (lesson.cancellationActor === 'parent' && lesson.lateParentCancellation) {
      return policy.lateParentCancellationPercent
    }
  }
  return 0
}

/**
 * Whether the line can be trusted as-is. A completed lesson is accepted
 * operationally unless the policy demands a delivery confirmation that has not
 * arrived; a cancellation is trusted only when we know who cancelled.
 */
function provenanceWarnings(lesson: EconomicsLesson, policy: CompensationPolicy): LineWarning[] {
  const warnings: LineWarning[] = []
  if (lesson.status === 'completed' && policy.requiresConfirmation && !lesson.deliveryConfirmedAt) {
    warnings.push('awaiting_confirmation')
  }
  if (lesson.status === 'cancelled') {
    if (!lesson.cancellationActor || lesson.cancellationActor === 'unknown') warnings.push('unknown_provenance')
    else if (lesson.cancellationActor === 'staff') warnings.push('staff_cancellation')
  }
  return warnings
}

function lineForLesson(
  lesson: EconomicsLesson,
  policies: readonly CompensationPolicy[],
  timezone: string
): EstimateLine {
  const durationHours = Math.max(0, DateTime.fromISO(lesson.endAt).diff(DateTime.fromISO(lesson.startAt), 'minutes').minutes / 60)
  const policy = resolveCompensationPolicy(policies, lesson.teacherId, lesson.startAt, timezone)
  const attributedRevenue = lesson.status === 'scheduled' ? 0 : roundMoney(Math.max(0, lesson.attributedRevenue))
  const eligible = lesson.status !== 'scheduled'

  const base = {
    lessonId: lesson.id,
    teacherId: lesson.teacherId,
    startAt: lesson.startAt,
    endAt: lesson.endAt,
    outcome: lesson.status,
    lessonType: lesson.lessonType,
    durationHours: roundHours(durationHours),
    enrolledStudentCount: lesson.enrolledStudentCount,
    studentNames: lesson.studentNames ?? [],
    attributedRevenue,
    revenueBasis: lesson.status === 'scheduled' ? 'none' as const : lesson.revenueBasis ?? 'none',
    subscriptionCovered: lesson.subscriptionCovered ?? false,
    packCovered: lesson.packCovered ?? false,
    cancellationActor: lesson.cancellationActor ?? null,
  }

  if (!policy) {
    return {
      ...base,
      estimatedCompensation: null,
      contribution: null,
      policyId: null,
      policySnapshot: null,
      confirmationState: 'missing_policy',
      warnings: ['missing_policy', ...(lesson.warnings ?? [])],
    }
  }

  const full = eligible ? fullCompensation(lesson, policy, durationHours) : 0
  const compensation = roundMoney(full * (compensationPercent(lesson, policy) / 100))
  const warnings: LineWarning[] = eligible
    ? [...provenanceWarnings(lesson, policy), ...(lesson.warnings ?? [])]
    : []

  return {
    ...base,
    estimatedCompensation: compensation,
    contribution: roundMoney(attributedRevenue - compensation),
    policyId: policy.id,
    policySnapshot: { ...policy },
    confirmationState: warnings.length > 0 ? 'estimated' : 'confirmed',
    warnings,
  }
}

export function calculateTeacherEconomics(
  lessons: readonly EconomicsLesson[],
  policies: readonly CompensationPolicy[],
  timezone: string
): TeacherEconomicsResult {
  const lines = lessons.map((lesson) => lineForLesson(lesson, policies, timezone))
  const deliveryLines = lines.filter((line) => line.outcome !== 'scheduled')
  const missingPolicyLines = deliveryLines.filter((line) => line.confirmationState === 'missing_policy')
  const missingPolicyWarnings = missingPolicyLines.map((line) => line.lessonId)

  const confirmationState: ConfirmationState = missingPolicyLines.length > 0
    ? 'missing_policy'
    : deliveryLines.some((line) => line.confirmationState === 'estimated')
      ? 'estimated'
      : 'confirmed'

  const count = (warning: LineWarning) => deliveryLines.filter((line) => line.warnings.includes(warning)).length
  const attention: AttentionCounts = {
    missingPolicy: missingPolicyLines.length,
    awaitingConfirmation: count('awaiting_confirmation'),
    unknownCancellation: count('unknown_provenance'),
    staffCancellation: count('staff_cancellation'),
    missingPrice: count('missing_price'),
    noStudents: count('no_students'),
  }

  const attributedRevenue = roundMoney(deliveryLines.reduce((sum, line) => sum + line.attributedRevenue, 0))
  const estimatedCompensation = missingPolicyLines.length > 0
    ? null
    : roundMoney(deliveryLines.reduce((sum, line) => sum + (line.estimatedCompensation ?? 0), 0))
  const contribution = estimatedCompensation == null ? null : roundMoney(attributedRevenue - estimatedCompensation)
  const contributionRate = contribution == null || attributedRevenue <= 0
    ? null
    : Math.round((contribution / attributedRevenue) * 1000) / 10

  return {
    deliveryCount: deliveryLines.length,
    deliveryHours: roundHours(deliveryLines.reduce((sum, line) => sum + line.durationHours, 0)),
    attributedRevenue,
    estimatedCompensation,
    contribution,
    contributionRate,
    missingPolicyWarnings,
    confirmationState,
    attention,
    lines,
  }
}
