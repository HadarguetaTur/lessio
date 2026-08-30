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
import { createCancellationCharge } from '@/lib/billing/createCharge'
import type { CancellationChargeResult } from '@/lib/billing/calculateCancellationCharge'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { getCancellationPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { previewCancellationCharge, isCancellableByParent } from './previewCancellationCharge'

export type CancellationError = 'already_cancelled' | 'not_eligible' | 'not_found'

/** Where the cancellation came from — recorded on the lesson. */
export type CancellationSource = 'whatsapp' | 'portal'

const CANCEL_REASON: Record<CancellationSource, string> = {
  whatsapp: 'CANCELLED_VIA_WHATSAPP',
  portal: 'CANCELLED_VIA_PORTAL',
}

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
  orgId: string,
  source: CancellationSource = 'whatsapp'
): Promise<ExecuteCancellationOutcome> {
  const db = createServiceRoleClient()
  const now = new Date()

  // 1. Load lesson with teacher rate and names; student comes via lesson_students
  const { data: lesson, error: lessonError } = await db
    .from('lessons')
    .select(
      'id, start_at, end_at, status, lesson_type, price_per_student, lesson_students(student_id, students(full_name)), teachers(id, hourly_rate, profiles(full_name))'
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

  // 5. Revalidate: still within the self-service window and in the future
  if (!isCancellableByParent(lesson.start_at, now)) {
    return { success: false, error: 'not_eligible' }
  }

  // 6. Price the cancellation BEFORE cancelling.
  // These reads can fail — a missing pricing row, a network blip. If they ran
  // after the update, a throw here would leave the lesson cancelled with no
  // charge, and the parent's retry would get `already_cancelled`: the lesson is
  // gone and nobody is billed for it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teacher = (lesson.teachers as any) as { id: string; hourly_rate: number | null; profiles: { full_name: string } }
  const studentName = lessonStudents[0]?.students.full_name ?? '—'

  const [pricing, policy] = await Promise.all([
    getOrgPricing(orgId),
    getCancellationPolicyServiceRole(orgId),
  ])

  const chargeResult = previewCancellationCharge(
    {
      start_at: lesson.start_at,
      end_at: lesson.end_at,
      lesson_type: lesson.lesson_type as string | null,
      price_per_student: (lesson.price_per_student as number | null) ?? null,
      teacherHourlyRate: teacher?.hourly_rate ?? null,
    },
    now,
    pricing,
    policy
  )

  // 7. Cancel the lesson
  const { error: cancelError } = await db
    .from('lessons')
    .update({
      status: 'cancelled',
      cancel_reason: CANCEL_REASON[source],
      updated_at: now.toISOString(),
    })
    .eq('id', lessonId)
    .eq('organization_id', orgId)

  if (cancelError) {
    throw new Error(`[executeCancellation] Failed to cancel lesson: ${cancelError.message}`)
  }

  // 8. Create charge record if applicable
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
