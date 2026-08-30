/**
 * Payment request utilities.
 * Per /docs/sprint-4-scope.md § Payment Request — Rules.
 * Only pending charges are included. No payment provider integration.
 */

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OPEN_CHARGE_STATUSES, sumRemaining } from '@/lib/charges'

export interface PaymentRequestCharge {
  id: string
  amount: number
  charge_type: 'lesson' | 'cancellation' | 'manual' | 'monthly'
  lesson_start_at: string | null
  student_name: string | null
}

/**
 * Fetches open charges for a parent, including the student name via the lesson.
 *
 * The student name is resolved through `lesson_students`, not a direct
 * `lessons.student_id` — that column was dropped in 20260325000001 when lessons
 * became many-to-many. Embedding `students` under `lessons` no longer resolves.
 *
 * A group lesson has several enrolled students, so the name is narrowed to the
 * ones THIS parent is related to. Picking the first enrolment instead would put
 * another family's child's name in a WhatsApp message. When the parent has no
 * enrolled student on the lesson the name stays null and the line degrades to
 * "Lesson, 12 August" — see buildChargeLines.
 */
export async function getPendingChargesForParent(
  parentId: string,
  orgId: string
): Promise<PaymentRequestCharge[]> {
  const supabase = await createClient()

  const [chargesRes, relationsRes] = await Promise.all([
    supabase
      .from('charges')
      .select('id, amount, amount_paid, charge_type, lesson_id, lessons(start_at, lesson_students(student_id, students(full_name)))')
      .eq('organization_id', orgId)
      .eq('parent_id', parentId)
      .in('status', [...OPEN_CHARGE_STATUSES])
      .order('created_at', { ascending: true }),
    supabase
      .from('relationships')
      .select('student_id')
      .eq('organization_id', orgId)
      .eq('parent_id', parentId),
  ])

  if (chargesRes.error) throw new Error(`[getPendingChargesForParent] ${chargesRes.error.message}`)
  if (relationsRes.error) throw new Error(`[getPendingChargesForParent] ${relationsRes.error.message}`)

  const ownStudentIds = new Set((relationsRes.data ?? []).map((r) => r.student_id as string))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (chargesRes.data ?? []).map((c: any) => {
    const enrolments: Array<{ student_id: string; students?: { full_name?: string } | null }> =
      c.lessons?.lesson_students ?? []
    const own = enrolments.find((e) => ownStudentIds.has(e.student_id))

    return {
      id: c.id,
      // What the parent still owes — a partially-paid charge is asked for its
      // remainder, not the original amount.
      amount: sumRemaining([c]),
      charge_type: c.charge_type,
      lesson_start_at: c.lessons?.start_at ?? null,
      student_name: own?.students?.full_name ?? null,
    }
  })
}

/**
 * Logs sent_at and sent_by_profile_id on all included charges.
 * Idempotent — overwrites previous sent_at if called again.
 * Does NOT change charge status or amounts.
 */
export async function logPaymentRequestSent(
  chargeIds: string[],
  orgId: string,
  profileId: string
): Promise<void> {
  if (chargeIds.length === 0) {
    return
  }

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('charges')
    .update({
      sent_at: new Date().toISOString(),
      sent_by_profile_id: profileId,
      updated_at: new Date().toISOString(),
    })
    .in('id', chargeIds)
    .eq('organization_id', orgId)

  if (error) {
    throw new Error(`[logPaymentRequestSent] ${error.message}`)
  }
}
