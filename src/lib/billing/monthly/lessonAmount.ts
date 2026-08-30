import { DateTime } from 'luxon'
import type {
  LessonRow,
  SubscriptionRow,
  LessonsContribution,
  MissingFieldsError,
} from './types'
import { BILLABLE_STATUSES, round2 } from './types'
import { checkActiveSubscriptionForLesson } from './subscriptions'
import {
  resolveLessonBaseAmount,
  isMissingPrice,
  isLessonCoveredBySubscription,
} from '@/lib/billing/lessonPricing'
import type { OrgPricing } from '@/lib/organizations/pricing'

/**
 * Is this lesson covered by the student's subscription under the org's policy?
 * Shared by the amount calculation and the contribution loop so a covered lesson
 * is zeroed and excluded from the count by the same rule.
 */
function isCoveredForStudent(
  lesson: LessonRow,
  studentId: string,
  subscriptions: SubscriptionRow[],
  timezone: string,
  pricing: OrgPricing
): boolean {
  const lessonDate = DateTime.fromISO(lesson.start_at, { zone: timezone }).toISODate()!
  return isLessonCoveredBySubscription(
    lesson.lesson_type,
    pricing.subscriptionCoveredLessonTypes,
    checkActiveSubscriptionForLesson(studentId, lessonDate, subscriptions)
  )
}

/**
 * Calculate the billing amount for a single lesson for a given student (spec §2).
 * Returns the per-student amount, or a MissingFieldsError.
 */
export function calculateLessonAmount(
  lesson: LessonRow,
  studentId: string,
  subscriptions: SubscriptionRow[],
  timezone: string,
  studentCountForLesson: number,
  pricing: OrgPricing
): number | MissingFieldsError {
  const durationMinutes =
    (new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / (1000 * 60)

  // An individual lesson with several students has no split rule — refuse rather
  // than bill one of them for the whole thing.
  if (lesson.lesson_type === 'individual' && studentCountForLesson > 1) {
    return {
      MISSING_FIELDS: [
        {
          table: 'lessons',
          field: 'lesson_type',
          why_needed: 'Individual lesson has multiple students — no split rule defined',
          example_values: ['pair', 'group', 'custom'],
        },
      ],
    }
  }

  // Lesson types the org's policy says a subscription covers are already paid for.
  if (isCoveredForStudent(lesson, studentId, subscriptions, timezone, pricing)) return 0

  const amount = resolveLessonBaseAmount(
    {
      lessonType: lesson.lesson_type,
      pricePerStudent: lesson.price_per_student,
      durationMinutes,
      teacherHourlyRate: lesson.teacher.hourly_rate,
    },
    pricing
  )

  if (isMissingPrice(amount)) return { MISSING_FIELDS: [amount.missing] }
  return amount
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
  studentCountByLesson: Map<string, number>,
  pricing: OrgPricing
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
      studentCount,
      pricing
    )

    if (typeof amount === 'object') return amount // MissingFieldsError

    // Covered by the subscription → contributes nothing, so it is not a billed lesson.
    if (isCoveredForStudent(lesson, studentId, subscriptions, timezone, pricing)) continue

    lessonsTotal += amount
    lessonsCount++
  }

  return {
    lessonsTotal: round2(lessonsTotal),
    lessonsCount,
  }
}
