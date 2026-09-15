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

export interface EconomicsLesson {
  id: string
  teacherId: string
  startAt: string
  endAt: string
  status: LessonOutcome
  lessonType: 'individual' | 'pair' | 'group' | 'custom'
  enrolledStudentCount: number
  attributedRevenue: number
  cancellationActor?: CancellationActor
  lateParentCancellation?: boolean
  deliveryConfirmedAt?: string | null
  deliveryConfirmationSource?: 'teacher' | 'staff' | 'automatic' | 'unknown' | null
}

export interface EstimateLine {
  lessonId: string
  teacherId: string
  outcome: LessonOutcome
  durationHours: number
  enrolledStudentCount: number
  attributedRevenue: number
  estimatedCompensation: number
  contribution: number
  policyId: string | null
  policySnapshot: CompensationPolicy | null
  confirmationState: 'confirmed' | 'estimated' | 'missing_policy'
  warnings: string[]
}

export interface TeacherEconomicsResult {
  deliveryCount: number
  deliveryHours: number
  attributedRevenue: number
  estimatedCompensation: number
  contribution: number
  missingPolicyWarnings: string[]
  confirmationState: 'confirmed' | 'estimated' | 'missing_policy'
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

function compensationPercent(lesson: EconomicsLesson, policy: CompensationPolicy): number {
  if (lesson.status === 'completed') return 100
  if (lesson.status === 'no_show') return policy.noShowPercent
  if (lesson.status === 'cancelled') {
    if (lesson.cancellationActor === 'teacher') return 0
    if (lesson.cancellationActor === 'parent' && lesson.lateParentCancellation) {
      return policy.lateParentCancellationPercent
    }
  }
  return 0
}

function lineForLesson(
  lesson: EconomicsLesson,
  policies: readonly CompensationPolicy[],
  timezone: string
): EstimateLine {
  const durationHours = Math.max(0, DateTime.fromISO(lesson.endAt).diff(DateTime.fromISO(lesson.startAt), 'minutes').minutes / 60)
  const policy = resolveCompensationPolicy(policies, lesson.teacherId, lesson.startAt, timezone)
  const warnings: string[] = []
  const attributedRevenue = lesson.status === 'scheduled' ? 0 : roundMoney(Math.max(0, lesson.attributedRevenue))

  if (!policy) {
    warnings.push('missing_policy')
    return {
      lessonId: lesson.id,
      teacherId: lesson.teacherId,
      outcome: lesson.status,
      durationHours: roundHours(durationHours),
      enrolledStudentCount: lesson.enrolledStudentCount,
      attributedRevenue,
      estimatedCompensation: 0,
      contribution: attributedRevenue,
      policyId: null,
      policySnapshot: null,
      confirmationState: 'missing_policy',
      warnings,
    }
  }

  const eligible = lesson.status !== 'scheduled'
  const base = eligible ? fullCompensation(lesson, policy, durationHours) : 0
  const compensation = roundMoney(base * (compensationPercent(lesson, policy) / 100))
  const needsConfirmation = policy.requiresConfirmation && lesson.status === 'completed' && !lesson.deliveryConfirmedAt
  const unknownProvenance = lesson.status === 'cancelled'
    ? !lesson.cancellationActor || lesson.cancellationActor === 'unknown'
    : lesson.status === 'completed' && !lesson.deliveryConfirmedAt
  const confirmationState = needsConfirmation || unknownProvenance ? 'estimated' : 'confirmed'
  if (needsConfirmation) warnings.push('awaiting_confirmation')
  if (unknownProvenance) warnings.push('unknown_provenance')

  return {
    lessonId: lesson.id,
    teacherId: lesson.teacherId,
    outcome: lesson.status,
    durationHours: roundHours(durationHours),
    enrolledStudentCount: lesson.enrolledStudentCount,
    attributedRevenue,
    estimatedCompensation: compensation,
    contribution: roundMoney(attributedRevenue - compensation),
    policyId: policy.id,
    policySnapshot: { ...policy },
    confirmationState,
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
  const missingPolicyWarnings = lines
    .filter((line) => line.confirmationState === 'missing_policy')
    .map((line) => line.lessonId)
  const confirmationState = lines.some((line) => line.confirmationState === 'missing_policy')
    ? 'missing_policy'
    : lines.some((line) => line.confirmationState === 'estimated')
      ? 'estimated'
      : 'confirmed'

  const attributedRevenue = roundMoney(lines.reduce((sum, line) => sum + line.attributedRevenue, 0))
  const estimatedCompensation = roundMoney(lines.reduce((sum, line) => sum + line.estimatedCompensation, 0))
  return {
    deliveryCount: deliveryLines.length,
    deliveryHours: roundHours(deliveryLines.reduce((sum, line) => sum + line.durationHours, 0)),
    attributedRevenue,
    estimatedCompensation,
    contribution: roundMoney(attributedRevenue - estimatedCompensation),
    missingPolicyWarnings,
    confirmationState,
    lines,
  }
}
