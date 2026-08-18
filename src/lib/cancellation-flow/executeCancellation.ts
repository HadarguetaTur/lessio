/**
 * Executes a WhatsApp-initiated lesson cancellation.
 * Revalidates lesson eligibility, cancels lesson, applies charge, returns outcome.
 *
 * Per /docs/sprint-4-scope.md § WhatsApp Cancellation — Charge Rules.
 * Per /docs/decisions.md #14.
 *
 * calculateCancellationCharge() is reused from Sprint 3 — never reimplemented here.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { calculateCancellationCharge } from '@/lib/billing/calculateCancellationCharge'
import { createCancellationCharge } from '@/lib/billing/createCharge'
import type { CancellationChargeResult } from '@/lib/billing/calculateCancellationCharge'

export type CancellationError = 'already_cancelled' | 'not_eligible' | 'not_found'

export interface ExecuteCancellationResult {
  success: true
  lessonStartAt: string
  studentName: string
  teacherName: string
  chargeResult: CancellationChargeResult
}

export interface ExecuteCancellationFailure {
  success: false
  error: CancellationError
}

export type ExecuteCancellationOutcome = ExecuteCancellationResult | ExecuteCancellationFailure

/**
 * Revalidates and executes a lesson cancellation.
 * Idempotent: if the lesson is already cancelled, returns already_cancelled (no charge).
 */
export async function executeCancellation(
  lessonId: string,
  parentId: string,
  orgId: string
): Promise<ExecuteCancellationOutcome> {
  const db = createServiceRoleClient()
  const now = new Date()

  // 1. Load lesson with teacher rate and names; student comes via lesson_students
  const { data: lesson, error: lessonError } = await db
    .from('lessons')
    .select(
      'id, start_at, end_at, status, lesson_students(student_id, students(full_name)), teachers(id, hourly_rate, profiles(full_name))'
    )
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .single()

  if (lessonError || !lesson) return { success: false, error: 'not_found' }

  // 2. Idempotency: already cancelled — safe return, no duplicate charge
  if (lesson.status === 'cancelled') return { success: false, error: 'already_cancelled' }

  // 3. Revalidate: must still be scheduled
  if (lesson.status !== 'scheduled') return { success: false, error: 'not_eligible' }

  // Resolve primary student for this lesson
  const lessonStudents = (lesson.lesson_students as unknown as Array<{ student_id: string; students: { full_name: string } }>)
  const primaryStudentId = lessonStudents[0]?.student_id

  if (!primaryStudentId) return { success: false, error: 'not_eligible' }

  // 4. Revalidate: still belongs to this parent
  const { data: rel } = await db
    .from('relationships')
    .select('id')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)
    .eq('student_id', primaryStudentId)
    .maybeSingle()

  if (!rel) return { success: false, error: 'not_eligible' }

  // 5. Revalidate: still within 7-day window and in the future
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const lessonStart = new Date(lesson.start_at)
  if (lessonStart <= now || lessonStart > sevenDaysLater) {
    return { success: false, error: 'not_eligible' }
  }

  // 6. Cancel the lesson
  const { error: cancelError } = await db
    .from('lessons')
    .update({ status: 'cancelled', cancel_reason: 'CANCELLED_VIA_WHATSAPP', updated_at: now.toISOString() })
    .eq('id', lessonId)
    .eq('organization_id', orgId)

  if (cancelError) {
    throw new Error(`[executeCancellation] Failed to cancel lesson: ${cancelError.message}`)
  }

  // 7. Fetch cancellation policy (service-role, not auth client)
  const { data: policy } = await db
    .from('cancellation_policies')
    .select('id, notice_hours_full, notice_hours_partial, partial_charge_percent')
    .eq('organization_id', orgId)
    .maybeSingle()

  // 8. Calculate charge — reuse Sprint 3 function, never reimplement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teacher = (lesson.teachers as any) as { id: string; hourly_rate: number | null; profiles: { full_name: string } }
  const studentName = lessonStudents[0]?.students.full_name ?? '—'
  const chargeResult = calculateCancellationCharge(
    { start_at: lesson.start_at, end_at: lesson.end_at, hourly_rate: teacher.hourly_rate },
    now,
    policy ?? null
  )

  // 9. Create charge record if applicable
  if (chargeResult.shouldCharge && chargeResult.amount > 0) {
    await createCancellationCharge(lessonId, orgId, parentId, chargeResult)
  }

  return {
    success: true,
    lessonStartAt: lesson.start_at,
    studentName,
    teacherName: teacher.profiles.full_name,
    chargeResult,
  }
}
