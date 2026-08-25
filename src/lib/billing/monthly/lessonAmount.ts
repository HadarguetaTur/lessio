import { DateTime } from 'luxon'
import type {
  LessonRow,
  SubscriptionRow,
  LessonsContribution,
  MissingFieldsError,
} from './types'
import {
  BILLABLE_STATUSES,
  PAIR_DEFAULT_PRICE,
  GROUP_DEFAULT_PRICE,
  round2,
} from './types'
import { checkActiveSubscriptionForLesson } from './subscriptions'

/**
 * Calculate the billing amount for a single lesson for a given student (spec §2).
 * Returns the per-student amount, or a MissingFieldsError.
 */
export function calculateLessonAmount(
  lesson: LessonRow,
  studentId: string,
  subscriptions: SubscriptionRow[],
  timezone: string,
  studentCountForLesson: number
): number | MissingFieldsError {
  const lessonDate = DateTime.fromISO(lesson.start_at, { zone: timezone }).toISODate()!

  const durationMinutes =
    (new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / (1000 * 60)

  switch (lesson.lesson_type) {
    case 'individual': {
      if (studentCountForLesson > 1) {
        return {
          MISSING_FIELDS: [
            {
              table: 'lessons',
              field: 'lesson_type',
              why_needed:
                'Individual lesson has multiple students — no split rule defined',
              example_values: ['pair', 'group'],
            },
          ],
        }
      }

      if (lesson.teacher.hourly_rate == null) {
        return {
          MISSING_FIELDS: [
            {
              table: 'teachers',
              field: 'hourly_rate',
              why_needed:
                'Individual lesson requires teacher hourly_rate for billing',
              example_values: ['150', '200'],
            },
          ],
        }
      }

      return round2(lesson.teacher.hourly_rate * (durationMinutes / 60))
    }

    case 'pair': {
      const hasSubscription = checkActiveSubscriptionForLesson(
        studentId,
        lessonDate,
        subscriptions
      )
      if (hasSubscription) return 0
      return lesson.price_per_student ?? PAIR_DEFAULT_PRICE
    }

    case 'group': {
      const hasSubscription = checkActiveSubscriptionForLesson(
        studentId,
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
 * Calculate the lessons contribution for a billing month (spec §4.2).
 */
export function calculateLessonsContribution(
  lessons: LessonRow[],
  billingMonth: string,
  studentId: string,
  subscriptions: SubscriptionRow[],
  timezone: string,
  cancelledLessonIds: Set<string>,
  studentCountByLesson: Map<string, number>
): LessonsContribution | MissingFieldsError {
  let lessonsTotal = 0
  let lessonsCount = 0

  for (const lesson of lessons) {
    // Derive billing month from start_at in org timezone
    const lessonMonth = DateTime.fromISO(lesson.start_at, { zone: timezone }).toFormat(
      'yyyy-MM'
    )
    if (lessonMonth !== billingMonth) continue

    // Skip non-billable statuses
    if (!(BILLABLE_STATUSES as readonly string[]).includes(lesson.status)) continue

    // Skip lessons with cancellation events (counted in cancellations instead)
    if (cancelledLessonIds.has(lesson.id)) continue

    const studentCount = studentCountByLesson.get(lesson.id) ?? 1
    const amount = calculateLessonAmount(
      lesson,
      studentId,
      subscriptions,
      timezone,
      studentCount
    )

    if (typeof amount === 'object') return amount // MissingFieldsError

    // pair/group with subscription coverage → amount is 0 → skip from count
    if (lesson.lesson_type !== 'individual' && amount === 0) continue

    lessonsTotal += amount
    lessonsCount++
  }

  return {
    lessonsTotal: round2(lessonsTotal),
    lessonsCount,
  }
}
