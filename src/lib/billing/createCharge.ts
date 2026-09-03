import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logChargeAudit } from '@/lib/charges/audit'
import { resolveBillingParent, MissingPrimaryParentError } from './resolveBillingParent'
import type { CancellationChargeResult } from './calculateCancellationCharge'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { getOrgTimezone } from '@/lib/organizations'
import {
  resolveLessonBaseAmount,
  isMissingPrice,
  isLessonCoveredBySubscription,
  toStudentPricing,
  type MissingPriceField,
  type ResolvedAmount,
  type StudentPricing,
} from './lessonPricing'
import {
  checkActiveSubscriptionForLesson,
  type CoverageSubscription,
} from './monthly/subscriptions'
import { resolveChargeDueDate } from './chargeDueDate'
import type { LessonType } from '@/lib/lessons/types'
import { getOrgBillingPolicy } from './orgBillingPolicy'

export type ChargeAlert = {
  type: 'missing_rate' | 'missing_price' | 'missing_parent' | 'error'
  message: string
}

function isDuplicateInsertError(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

/**
 * Creates the lesson charges when a lesson is marked completed.
 *
 * One charge per participant, billed to that student's own primary parent —
 * a pair/group/custom lesson bills every family, not just the first one.
 * Amounts come from the shared pricing resolver, so a lesson costs the same
 * here as it does in the monthly engine.
 *
 * Students whose subscription covers this lesson type (org policy, see
 * organizations.subscription_covered_lesson_types) are skipped entirely — the
 * monthly engine zeroes the same lesson, so charging here was a double charge.
 * Note this path still does not branch on organizations.billing_mode.
 *
 * Idempotent: the unique index on charges(lesson_id, parent_id) WHERE
 * charge_type='lesson' makes a repeated call a no-op.
 *
 * Returns a ChargeAlert if no charge could be created at all; when only some
 * students fail (no primary parent), the rest are still charged and the first
 * problem is reported.
 */
export async function createLessonCharge(
  lessonId: string,
  organizationId: string
): Promise<ChargeAlert | null> {
  const policy = await getOrgBillingPolicy(organizationId)
  if (policy.billingMode === 'monthly') return null

  const supabase = createServiceRoleClient()

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, start_at, end_at, lesson_type, price_per_student, lesson_students(student_id, students(hourly_rate, discount_percent)), teachers(id, hourly_rate)'
    )
    .eq('id', lessonId)
    .eq('organization_id', organizationId)
    .single()

  if (lessonError || !lesson) {
    console.error('[createLessonCharge] lesson not found', { lessonId, orgId: organizationId, error: lessonError?.message })
    return { type: 'error', message: 'validation.lessonNotFound' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teacher = (lesson.teachers as any) as { id: string; hourly_rate: number | null }
  const lessonType = ((lesson.lesson_type as LessonType) ?? 'individual')

  const durationMinutes =
    (new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / (1000 * 60)

  const pricing = await getOrgPricing(organizationId)

  // The price is per student: a personal rate or discount on `students` changes
  // what one family owes without touching the others in a pair/group lesson.
  const priceForStudent = (studentPricing: StudentPricing): ResolvedAmount =>
    resolveLessonBaseAmount(
      {
        lessonType,
        pricePerStudent: (lesson.price_per_student as number | null) ?? null,
        durationMinutes,
        teacherHourlyRate: teacher?.hourly_rate ?? null,
        studentHourlyRate: studentPricing.hourlyRate,
        studentDiscountPercent: studentPricing.discountPercent,
      },
      pricing
    )

  const missingPriceAlert = (missing: MissingPriceField): ChargeAlert => {
    console.error('[createLessonCharge] cannot price lesson', {
      lessonId,
      orgId: organizationId,
      lessonType,
      missing: missing.field,
    })
    return missing.field === 'hourly_rate'
      ? { type: 'missing_rate', message: 'validation.noTeacherRate' }
      : { type: 'missing_price', message: 'validation.noLessonPrice' }
  }

  // `students` is a to-one embed, but the select-string parser widens it to an
  // array, so the cast goes through `unknown`.
  const lessonStudents =
    (lesson.lesson_students as unknown as Array<{
      student_id: string
      students?: { hourly_rate: number | null; discount_percent: number | null } | null
    }>) ?? []
  if (lessonStudents.length === 0) {
    console.error('[createLessonCharge] no students in lesson_students', { lessonId, orgId: organizationId })
    return { type: 'missing_parent', message: 'validation.noLinkedStudents' }
  }

  let firstAlert: ChargeAlert | null = null
  let chargedCount = 0
  let coveredCount = 0

  // Hoisted: one query for the whole lesson, not one per student.
  const timezone = await getOrgTimezone(organizationId)
  const dueDate = resolveChargeDueDate({ chargeType: 'lesson', issuedAt: new Date(), timezone })
  const lessonDate = DateTime.fromISO(lesson.start_at as string, { zone: timezone }).toISODate()!

  // Only worth a query when the org's policy can actually cover this lesson type.
  let subscriptions: CoverageSubscription[] = []
  if (pricing.subscriptionCoveredLessonTypes.includes(lessonType)) {
    const { data: subsData, error: subsError } = await supabase
      .from('subscriptions')
      .select('student_id, start_date, end_date, is_paused')
      .eq('organization_id', organizationId)
      .in(
        'student_id',
        lessonStudents.map((s) => s.student_id)
      )

    // Fail loud: charging because the coverage lookup broke is the bug being fixed.
    if (subsError) {
      console.error('[createLessonCharge] subscription lookup failed', { lessonId, orgId: organizationId, error: subsError.message })
      return { type: 'error', message: 'validation.createChargeFailed' }
    }
    subscriptions = (subsData as CoverageSubscription[] | null) ?? []
  }

  for (const { student_id: studentId, students: studentRow } of lessonStudents) {
    // Covered by an active subscription → the monthly engine bills 0, so no charge row.
    if (
      isLessonCoveredBySubscription(
        lessonType,
        pricing.subscriptionCoveredLessonTypes,
        checkActiveSubscriptionForLesson(studentId, lessonDate, subscriptions)
      )
    ) {
      coveredCount++
      continue
    }

    const resolved = priceForStudent(toStudentPricing(studentRow))
    if (isMissingPrice(resolved)) {
      firstAlert ??= missingPriceAlert(resolved.missing)
      continue
    }
    const amount = resolved

    let parentId: string
    try {
      parentId = await resolveBillingParent(studentId, organizationId)
    } catch (e) {
      if (e instanceof MissingPrimaryParentError) {
        console.error('[createLessonCharge] no primary parent', { lessonId, orgId: organizationId, studentId, error: (e as Error).message })
        firstAlert ??= { type: 'missing_parent', message: 'validation.noPrimaryParent' }
        continue
      }
      throw e
    }

    const { data: inserted, error: insertError } = await supabase
      .from('charges')
      .insert({
        organization_id: organizationId,
        parent_id: parentId,
        lesson_id: lessonId,
        amount,
        charge_type: 'lesson',
        status: 'pending',
        due_date: dueDate,
      })
      .select('id')
      .single()

    if (insertError) {
      // Unique constraint violation = this parent was already charged for this lesson
      if (isDuplicateInsertError(insertError)) {
        chargedCount++
        continue
      }
      console.error('[createLessonCharge] insert error', { lessonId, orgId: organizationId, parentId, amount, error: insertError.message })
      firstAlert ??= { type: 'error', message: 'validation.createChargeFailed' }
      continue
    }

    chargedCount++

    await logChargeAudit({
      organizationId,
      chargeId: inserted.id as string,
      parentId,
      eventType: 'created',
      afterStatus: 'pending',
      afterAmount: amount,
      metadata: { source: 'lesson_completed', lesson_id: lessonId, student_id: studentId },
    })
  }

  // Nothing charged at all → surface the problem; a partial success is reported too
  // so the admin can fix the one student that fell through. A lesson whose whole
  // roster is subscription-covered charged nothing on purpose — not a failure.
  return chargedCount === 0 && coveredCount === 0
    ? (firstAlert ?? { type: 'error', message: 'validation.createChargeFailed' })
    : firstAlert
}

/**
 * Creates a cancellation charge from the result of calculateCancellationCharge.
 * Called from the manual cancellation flow (DEV-58).
 * Idempotent by the same unique index (charge_type = 'lesson' not applicable here,
 * but cancellation charges are created once per cancellation action).
 */
export async function createCancellationCharge(
  lessonId: string,
  organizationId: string,
  parentId: string,
  chargeResult: CancellationChargeResult
): Promise<ChargeAlert | null> {
  if (!chargeResult.shouldCharge || chargeResult.amount === 0) return null

  const policy = await getOrgBillingPolicy(organizationId)
  if (policy.billingMode === 'monthly') return null

  const supabase = createServiceRoleClient()
  const timezone = await getOrgTimezone(organizationId)

  const { data: inserted, error } = await supabase
    .from('charges')
    .insert({
      organization_id: organizationId,
      parent_id: parentId,
      lesson_id: lessonId,
      amount: chargeResult.amount,
      charge_type: 'cancellation',
      status: 'pending',
      due_date: resolveChargeDueDate({
        chargeType: 'cancellation',
        issuedAt: new Date(),
        timezone,
      }),
    })
    .select('id')
    .single()

  if (error) {
    if (isDuplicateInsertError(error)) {
      return null
    }
    console.error('[createCancellationCharge] insert error', { lessonId, orgId: organizationId, parentId, amount: chargeResult.amount, error: error.message })
    return { type: 'error', message: 'validation.createCancellationChargeFailed' }
  }

  await logChargeAudit({
    organizationId,
    chargeId: inserted.id as string,
    parentId,
    eventType: 'created',
    afterStatus: 'pending',
    afterAmount: chargeResult.amount,
    metadata: { source: 'lesson_cancelled', lesson_id: lessonId },
  })

  return null
}
