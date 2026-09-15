import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { calculateTeacherEconomics, type CompensationPolicy, type EconomicsLesson, type EstimateLine } from './calculator'

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
  estimatedCompensation: number
  contribution: number
  confirmationState: 'confirmed' | 'estimated' | 'missing_policy'
  missingPolicyWarnings: string[]
  estimateLines: EstimateLine[]
}

export interface TeacherPersonalEstimate extends OperationalTeacherReport {
  estimatedCompensation: number
  confirmationState: 'confirmed' | 'estimated' | 'missing_policy'
}

type OwnerLessonRow = {
  id: string
  teacher_id: string
  status: EconomicsLesson['status']
  start_at: string
  end_at: string
  lesson_type: EconomicsLesson['lessonType'] | null
  price_per_student: number | string | null
  cancel_reason: string | null
  cancelled_at: string | null
  cancellation_source: string | null
  delivery_confirmed_at: string | null
  delivery_confirmation_source: EconomicsLesson['deliveryConfirmationSource']
  lesson_students: Array<{ student_id: string }>
  teachers: unknown
  charges: Array<{ amount: number | string | null; charge_type: string | null }>
}

function monthBounds(month: string, timezone: string): { start: string; end: string } {
  const start = DateTime.fromFormat(month, 'yyyy-MM', { zone: timezone }).startOf('month')
  if (!start.isValid) throw new Error('INVALID_MONTH')
  return { start: start.toUTC().toISO()!, end: start.plus({ months: 1 }).toUTC().toISO()! }
}

function teacherName(row: unknown): string {
  const value = row as { profiles?: { full_name?: string } | { full_name?: string }[] | null } | null
  const profile = Array.isArray(value?.profiles) ? value.profiles[0] : value?.profiles
  return profile?.full_name ?? '—'
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
    .select('id, teacher_id, status, start_at, end_at, lesson_type, price_per_student, cancel_reason, cancelled_at, cancellation_source, delivery_confirmed_at, delivery_confirmation_source, lesson_students(student_id), teachers(profiles(full_name)), charges(amount, charge_type)')
    .eq('organization_id', organizationId)
    .gte('start_at', start)
    .lt('start_at', end)
  if (teacherId) query = query.eq('teacher_id', teacherId)
  const { data: rows, error } = await query
  if (error) throw new Error(error.message)

  const { data: policyRows, error: policyError } = await db
    .from('compensation_policies')
    .select('*')
    .eq('organization_id', organizationId)
  if (policyError) throw new Error(policyError.message)

  const policies: CompensationPolicy[] = (policyRows ?? []).map((row) => ({
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

  const operations = operationRows((rows ?? []) as { teacher_id: string; status: string; start_at: string; end_at: string; teachers: unknown }[])
  const grouped = new Map<string, EconomicsLesson[]>()
  for (const row of (rows ?? []) as OwnerLessonRow[]) {
    const charges = Array.isArray(row.charges) ? row.charges as OwnerLessonRow['charges'] : []
    const attributedRevenue = charges
      .filter((charge) => charge.charge_type === 'lesson' || charge.charge_type === 'cancellation')
      .reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0)
    const students = Array.isArray(row.lesson_students) ? row.lesson_students : []
    const items = grouped.get(row.teacher_id) ?? []
    items.push({
      id: row.id,
      teacherId: row.teacher_id,
      startAt: row.start_at,
      endAt: row.end_at,
      status: row.status,
      lessonType: row.lesson_type ?? 'individual',
      enrolledStudentCount: students.length,
      attributedRevenue,
      cancellationActor: row.cancellation_source === 'teacher' ? 'teacher' : row.cancellation_source === 'parent' ? 'parent' : row.cancellation_source ? 'unknown' : null,
      lateParentCancellation: row.cancellation_source === 'parent' && Boolean(row.cancelled_at),
      deliveryConfirmedAt: row.delivery_confirmed_at,
      deliveryConfirmationSource: row.delivery_confirmation_source,
    })
    grouped.set(row.teacher_id, items)
  }

  return operations.map((operation) => {
    const result = calculateTeacherEconomics(grouped.get(operation.teacherId) ?? [], policies, timezone)
    return {
      ...operation,
      attributedRevenue: result.attributedRevenue,
      estimatedCompensation: result.estimatedCompensation,
      contribution: result.contribution,
      confirmationState: result.confirmationState,
      missingPolicyWarnings: result.missingPolicyWarnings,
      estimateLines: result.lines,
    }
  })
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
    estimatedCompensation: row.estimatedCompensation,
    confirmationState: row.confirmationState,
  }
}
