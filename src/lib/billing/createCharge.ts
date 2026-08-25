import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logChargeAudit } from '@/lib/charges/audit'
import { resolveBillingParent, MissingPrimaryParentError } from './resolveBillingParent'
import type { CancellationChargeResult } from './calculateCancellationCharge'

export type ChargeAlert = {
  type: 'missing_rate' | 'missing_parent' | 'error'
  message: string
}

function isDuplicateInsertError(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

/**
 * Creates a lesson charge when a lesson is marked completed.
 * Idempotent: the unique index on charges(lesson_id) WHERE charge_type='lesson'
 * ensures a second call for the same lesson is silently ignored.
 *
 * Returns a ChargeAlert if the charge could not be created (missing rate / parent).
 * Returns null on success or duplicate (both are safe outcomes).
 */
export async function createLessonCharge(
  lessonId: string,
  organizationId: string
): Promise<ChargeAlert | null> {
  const supabase = createServiceRoleClient()

  // Fetch lesson with teacher hourly_rate; student resolved via lesson_students
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, start_at, end_at, lesson_students(student_id), teachers(id, hourly_rate)'
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

  if (teacher.hourly_rate == null) {
    console.error('[createLessonCharge] missing hourly_rate', { lessonId, orgId: organizationId, teacherId: teacher.id })
    return {
      type: 'missing_rate',
      message: 'validation.noTeacherRate',
    }
  }

  // Resolve billing parent via the primary student in lesson_students
  const lessonStudents = (lesson.lesson_students as Array<{ student_id: string }>)
  const primaryStudentId = lessonStudents[0]?.student_id

  if (!primaryStudentId) {
    console.error('[createLessonCharge] no students in lesson_students', { lessonId, orgId: organizationId })
    return { type: 'missing_parent', message: 'validation.noLinkedStudents' }
  }

  let parentId: string
  try {
    parentId = await resolveBillingParent(primaryStudentId, organizationId)
  } catch (e) {
    if (e instanceof MissingPrimaryParentError) {
      console.error('[createLessonCharge] no primary parent', { lessonId, orgId: organizationId, studentId: primaryStudentId, error: (e as Error).message })
      return {
        type: 'missing_parent',
        message: 'validation.noPrimaryParent',
      }
    }
    throw e
  }

  const durationMinutes =
    (new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / (1000 * 60)
  const amount = round2(teacher.hourly_rate * (durationMinutes / 60))

  const { data: inserted, error: insertError } = await supabase
    .from('charges')
    .insert({
      organization_id: organizationId,
      parent_id: parentId,
      lesson_id: lessonId,
      amount,
      charge_type: 'lesson',
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError) {
    // Unique constraint violation = duplicate call, safe to ignore
    if (isDuplicateInsertError(insertError)) {
      return null
    }
    console.error('[createLessonCharge] insert error', { lessonId, orgId: organizationId, parentId, amount, error: insertError.message })
    return { type: 'error', message: 'validation.createChargeFailed' }
  }

  await logChargeAudit({
    organizationId,
    chargeId: inserted.id as string,
    parentId,
    eventType: 'created',
    afterStatus: 'pending',
    afterAmount: amount,
    metadata: { source: 'lesson_completed', lesson_id: lessonId },
  })

  return null
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

  const supabase = createServiceRoleClient()

  const { data: inserted, error } = await supabase
    .from('charges')
    .insert({
      organization_id: organizationId,
      parent_id: parentId,
      lesson_id: lessonId,
      amount: chargeResult.amount,
      charge_type: 'cancellation',
      status: 'pending',
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
