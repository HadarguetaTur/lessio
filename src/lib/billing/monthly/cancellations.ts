import { DateTime } from 'luxon'
import type {
  CancellationEventRow,
  LessonRow,
  SubscriptionRow,
  CancellationsContribution,
  MissingFieldsError,
} from './types'
import { round2 } from './types'
import { checkActiveSubscriptionForLesson } from './subscriptions'
import {
  resolveLessonBaseAmount,
  isMissingPrice,
  isLessonCoveredBySubscription,
  NO_STUDENT_PRICING,
  type StudentPricing,
} from '@/lib/billing/lessonPricing'
import type { OrgPricing } from '@/lib/organizations/pricing'

/**
 * Determine the charge amount for a single cancellation event (spec §5.1).
 */
function calculateCancellationEventAmount(
  event: CancellationEventRow,
  lesson: LessonRow | undefined,
  subscriptions: SubscriptionRow[],
  timezone: string,
  pricing: OrgPricing,
  studentPricing: StudentPricing
): number | MissingFieldsError {
  if (event.charge_override != null) return event.charge_override

  if (!lesson) {
    return {
      MISSING_FIELDS: [
        {
          table: 'student_cancellation_events',
          field: 'lesson_id',
          why_needed:
            'Cancellation event references a lesson that could not be resolved',
          example_values: [],
        },
      ],
    }
  }

  const durationMinutes =
    (new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / (1000 * 60)

  const lessonDate = DateTime.fromISO(lesson.start_at, { zone: timezone }).toISODate()!

  // A covered lesson costs nothing when attended, so cancelling it costs nothing either.
  const covered = isLessonCoveredBySubscription(
    lesson.lesson_type,
    pricing.subscriptionCoveredLessonTypes,
    checkActiveSubscriptionForLesson(event.student_id, lessonDate, subscriptions)
  )
  if (covered) return 0

  const amount = resolveLessonBaseAmount(
    {
      lessonType: lesson.lesson_type,
      pricePerStudent: lesson.price_per_student,
      durationMinutes,
      teacherHourlyRate: lesson.teacher.hourly_rate,
      studentHourlyRate: studentPricing.hourlyRate,
      studentDiscountPercent: studentPricing.discountPercent,
    },
    pricing
  )

  if (isMissingPrice(amount)) return { MISSING_FIELDS: [amount.missing] }
  return amount
}

/**
 * Calculate the cancellations contribution for a billing month (spec §4.4 + §5).
 */
export function calculateCancellationsContribution(
  cancellations: CancellationEventRow[],
  lessonLookup: Map<string, LessonRow>,
  subscriptions: SubscriptionRow[],
  timezone: string,
  pricing: OrgPricing,
  studentPricing: StudentPricing = NO_STUDENT_PRICING
): CancellationsContribution | MissingFieldsError {
  let cancellationsTotal = 0
  let cancellationsCount = 0
  let pendingCancellationsCount = 0

  for (const event of cancellations) {
    // Pending cancellation = not yet confirmed by admin
    if (!event.is_charged) {
      pendingCancellationsCount++
      continue
    }

    // Only charge late cancellations (< 24h)
    if (!event.is_lt_24h) continue

    const lesson = lessonLookup.get(event.lesson_id)
    const amount = calculateCancellationEventAmount(
      event,
      lesson,
      subscriptions,
      timezone,
      pricing,
      studentPricing
    )

    if (typeof amount === 'object') return amount // MissingFieldsError

    if (amount > 0) {
      cancellationsTotal += amount
      cancellationsCount++
    }
  }

  return {
    cancellationsTotal: round2(cancellationsTotal),
    cancellationsCount,
    pendingCancellationsCount,
  }
}
