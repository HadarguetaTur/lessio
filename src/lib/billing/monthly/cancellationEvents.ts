import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import type { CancellationChargeResult } from '@/lib/billing/calculateCancellationCharge'
import { getCurrentBillingMonth } from './month'

/**
 * Create a student_cancellation_events record when a student's lesson is
 * cancelled. This feeds the monthly billing engine (spec §1.3).
 *
 * `charge` is the org cancellation policy's verdict, computed once by
 * `cancelLessonCore` and shared with the per-lesson charge path. Writing it here
 * is what makes a monthly org and a per-lesson org bill the same fee for the
 * same cancellation: the engine used to ignore the policy and charge the full
 * lesson price for anything under a hardcoded 24 hours.
 *
 * Safe to call for any billing_mode — a per-lesson org gets no row.
 *
 * Idempotent on (lesson_id, student_id): two concurrent cancellations of the
 * same lesson produce one financial event, not two.
 */
export async function createCancellationEvent(opts: {
  organizationId: string
  lessonId: string
  studentId: string
  lessonStartAt: string  // ISO UTC
  timezone: string
  charge: CancellationChargeResult
  cancelledAt?: Date
}): Promise<void> {
  const policy = await getOrgBillingPolicy(opts.organizationId)
  if (policy.billingMode !== 'monthly') return

  const supabase = createServiceRoleClient()
  const now = opts.cancelledAt ?? new Date()

  const lessonStart = new Date(opts.lessonStartAt)
  const hoursBefore =
    (lessonStart.getTime() - now.getTime()) / (1000 * 60 * 60)

  const lessonLocal = DateTime.fromISO(opts.lessonStartAt, { zone: opts.timezone })
  const billingMonth = getCurrentBillingMonth(opts.timezone, lessonLocal, policy.cycleStartDay)

  await supabase.from('student_cancellation_events').upsert(
    {
      organization_id: opts.organizationId,
      lesson_id: opts.lessonId,
      student_id: opts.studentId,
      cancellation_date: now.toISOString(),
      hours_before: Math.max(0, Math.round(hoursBefore * 100) / 100),
      // The column name predates configurable notice windows. It means "this
      // cancellation is chargeable", which is now the policy's call, not 24h.
      is_lt_24h: opts.charge.shouldCharge && opts.charge.amount > 0,
      is_charged: false,
      policy_amount: opts.charge.amount,
      billing_month: billingMonth,
    },
    { onConflict: 'lesson_id,student_id', ignoreDuplicates: true }
  )
}
