import { DateTime } from 'luxon'
import type {
  CancellationEventRow,
  LessonRow,
  SubscriptionRow,
  CancellationsContribution,
  MissingFieldsError,
} from './types'
import {
  PAIR_DEFAULT_PRICE,
  GROUP_DEFAULT_PRICE,
  round2,
} from './types'
import { checkActiveSubscriptionForLesson } from './subscriptions'

/**
 * Determine the charge amount for a single cancellation event (spec §5.1).
 */
function calculateCancellationEventAmount(
  event: CancellationEventRow,
  lesson: LessonRow | undefined,
  subscriptions: SubscriptionRow[],
  timezone: string
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

  switch (lesson.lesson_type) {
    case 'individual': {
      if (lesson.teacher.hourly_rate == null) {
        return {
          MISSING_FIELDS: [
            {
              table: 'teachers',
              field: 'hourly_rate',
              why_needed:
                'Individual cancellation charge requires teacher hourly_rate',
              example_values: ['150', '200'],
            },
          ],
        }
      }
      return round2(lesson.teacher.hourly_rate * (durationMinutes / 60))
    }

    case 'pair': {
      const hasSubscription = checkActiveSubscriptionForLesson(
        event.student_id,
        lessonDate,
        subscriptions
      )
      if (hasSubscription) return 0
      return lesson.price_per_student ?? PAIR_DEFAULT_PRICE
    }

    case 'group': {
      const hasSubscription = checkActiveSubscriptionForLesson(
        event.student_id,
        lessonDate,
        subscriptions
      )
      if (hasSubscription) return 0
      return lesson.price_per_student ?? GROUP_DEFAULT_PRICE
    }

    default:
      return {
        MISSING_FIELDS: [
          {
            table: 'lessons',
            field: 'lesson_type',
            why_needed: `Unknown lesson type: ${lesson.lesson_type}`,
            example_values: ['individual', 'pair', 'group'],
          },
        ],
      }
  }
}

/**
 * Calculate the cancellations contribution for a billing month (spec §4.4 + §5).
 */
export function calculateCancellationsContribution(
  cancellations: CancellationEventRow[],
  lessonLookup: Map<string, LessonRow>,
  subscriptions: SubscriptionRow[],
  timezone: string
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
      timezone
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
