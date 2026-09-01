import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { getCurrentBillingMonth } from './month'

/**
 * Create a student_cancellation_events record when a student's lesson is
 * cancelled. This feeds the monthly billing engine (spec §1.3).
 *
 * Safe to call for any billing_mode — the record is only consumed by the
 * monthly billing engine so it's a no-op for per-lesson orgs.
 */
export async function createCancellationEvent(opts: {
  organizationId: string
  lessonId: string
  studentId: string
  lessonStartAt: string  // ISO UTC
  timezone: string
}): Promise<void> {
  const policy = await getOrgBillingPolicy(opts.organizationId)
  if (policy.billingMode !== 'monthly') return

  const supabase = createServiceRoleClient()
  const now = new Date()

  const lessonStart = new Date(opts.lessonStartAt)
  const hoursBefore =
    (lessonStart.getTime() - now.getTime()) / (1000 * 60 * 60)
  const isLt24h = hoursBefore < 24

  const lessonLocal = DateTime.fromISO(opts.lessonStartAt, { zone: opts.timezone })
  const billingMonth = getCurrentBillingMonth(opts.timezone, lessonLocal, policy.cycleStartDay)

  await supabase.from('student_cancellation_events').insert({
    organization_id: opts.organizationId,
    lesson_id: opts.lessonId,
    student_id: opts.studentId,
    cancellation_date: now.toISOString(),
    hours_before: Math.max(0, Math.round(hoursBefore * 100) / 100),
    is_lt_24h: isLt24h,
    is_charged: false,
    billing_month: billingMonth,
  })
}
