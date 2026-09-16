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
  NO_STUDENT_PRICING,
  type StudentPricing,
} from '@/lib/billing/lessonPricing'
import type { OrgPricing } from '@/lib/organizations/pricing'
import { getBillingMonthRange } from './month'
import { isStudentAbsent } from '@/lib/lessons/attendance'
import type { CollectionPolicy } from '@/lib/cancellation-policy/collection'

/**
 * One student's side of the lessons in a month (decision #46). Absent from a
 * caller = the pre-packs engine: nobody absent beyond a no_show status, no
 * punches, and a no-show costs nothing.
 */
export interface LessonOutcomeContext {
  /** lessonId → this student's attendance row on that lesson. */
  attendanceByLesson: Map<string, { attendance: string | null; absence_amount: number | string | null }>
  /** Lessons this student's pack paid for (un-reversed consume_lesson / consume_no_show). */
  packUseLessonIds: Set<string>
  collection: Pick<CollectionPolicy, 'noShowChargePercent'>
}

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
  pricing: OrgPricing,
  studentPricing: StudentPricing = NO_STUDENT_PRICING
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
      studentHourlyRate: studentPricing.hourlyRate,
      studentDiscountPercent: studentPricing.discountPercent,
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
  pricing: OrgPricing,
  cycleStartDay = 1,
  studentPricing: StudentPricing = NO_STUDENT_PRICING,
  outcomes?: LessonOutcomeContext
): LessonsContribution | MissingFieldsError {
  let lessonsTotal = 0
  let lessonsCount = 0
  let noShowTotal = 0
  let noShowCount = 0

  for (const lesson of lessons) {
    const { monthStart, monthEnd } = getBillingMonthRange(billingMonth, timezone, cycleStartDay)
    const lessonStart = DateTime.fromISO(lesson.start_at, { zone: timezone })
    if (lessonStart < monthStart || lessonStart >= monthEnd) continue

    // Skip non-billable statuses
    if (!(BILLABLE_STATUSES as readonly string[]).includes(lesson.status)) continue

    // Skip lessons with cancellation events (counted in cancellations instead)
    if (cancelledLessonIds.has(lesson.id)) continue

    // A punch paid for this lesson, present or absent: nothing more to bill.
    if (outcomes?.packUseLessonIds.has(lesson.id)) continue

    const studentCount = studentCountByLesson.get(lesson.id) ?? 1
    const attendanceRow = outcomes?.attendanceByLesson.get(lesson.id)

    if (isStudentAbsent(lesson.status, attendanceRow?.attendance)) {
      if (isCoveredForStudent(lesson, studentId, subscriptions, timezone, pricing)) continue
      let fee: number
      if (attendanceRow?.absence_amount != null) {
        // The policy as it stood when the absence was settled.
        fee = Number(attendanceRow.absence_amount)
      } else {
        // Never settled (a legacy no_show): price it under today's policy.
        const percent = outcomes?.collection.noShowChargePercent ?? 0
        if (percent <= 0) continue
        const base = calculateLessonAmount(lesson, studentId, subscriptions, timezone, studentCount, pricing, studentPricing)
        if (typeof base === 'object') return base
        fee = round2((base * percent) / 100)
      }
      if (fee <= 0) continue
      noShowTotal += fee
      noShowCount++
      continue
    }
    const amount = calculateLessonAmount(
      lesson,
      studentId,
      subscriptions,
      timezone,
      studentCount,
      pricing,
      studentPricing
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
    noShowTotal: round2(noShowTotal),
    noShowCount,
  }
}
