import { calculateCancellationCharge } from '@/lib/billing/calculateCancellationCharge'
import type { CancellationChargeResult } from '@/lib/billing/calculateCancellationCharge'
import { resolveLessonBaseAmount, isMissingPrice, type StudentPricing } from '@/lib/billing/lessonPricing'
import type { CancellationPolicy } from '@/lib/cancellation-policy'
import type { OrgPricing } from '@/lib/organizations/pricing'
import type { LessonType } from '@/lib/lessons/types'

/** How far ahead a parent may cancel their own lesson. */
export const CANCELLATION_WINDOW_DAYS = 7

export interface CancellationPreviewLesson {
  start_at: string
  end_at: string
  lesson_type: string | null
  price_per_student: number | null
  teacherHourlyRate: number | null
  /** The cancelling student's personal pricing (students.hourly_rate / discount_percent). */
  studentPricing?: StudentPricing
}

/**
 * Pure. Given a lesson, a moment, the org's pricing and its policy, says what
 * cancelling costs.
 *
 * This is the single pricing path for cancellations: `executeCancellation` uses
 * it to decide what to charge, and the schedule page uses it to tell the parent
 * the number *before* they commit. Two implementations that agree by inspection
 * would drift; the parent would be quoted one amount and billed another.
 */
export function previewCancellationCharge(
  lesson: CancellationPreviewLesson,
  at: Date,
  pricing: OrgPricing,
  policy: CancellationPolicy | null
): CancellationChargeResult {
  const baseAmount = resolveLessonBaseAmount(
    {
      lessonType: (lesson.lesson_type as LessonType) ?? 'individual',
      pricePerStudent: lesson.price_per_student,
      durationMinutes:
        (new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / (1000 * 60),
      teacherHourlyRate: lesson.teacherHourlyRate,
      studentHourlyRate: lesson.studentPricing?.hourlyRate ?? null,
      studentDiscountPercent: lesson.studentPricing?.discountPercent ?? null,
    },
    pricing
  )

  return calculateCancellationCharge(
    {
      start_at: lesson.start_at,
      end_at: lesson.end_at,
      baseAmount: isMissingPrice(baseAmount) ? null : baseAmount,
    },
    at,
    policy
  )
}

/**
 * Whether a parent may still cancel this lesson themselves — future, and inside
 * the self-service window. The schedule page hides the cancel control when this
 * is false; without it the control renders on lessons a month out and the
 * confirmation fails with `not_eligible` only after the parent commits.
 */
export function isCancellableByParent(startAt: string, now: Date): boolean {
  const start = new Date(startAt).getTime()
  const windowEnd = now.getTime() + CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return start > now.getTime() && start <= windowEnd
}
