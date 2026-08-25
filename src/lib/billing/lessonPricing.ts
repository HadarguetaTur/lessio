import type { LessonType } from '@/lib/lessons/types'
import type { OrgPricing } from '@/lib/organizations/pricing'

export interface PricedLessonInput {
  lessonType: LessonType
  /** Per-lesson override (pair/group) or the required price (custom). */
  pricePerStudent: number | null
  durationMinutes: number
  /** The lesson teacher's personal rate; overrides the org default. */
  teacherHourlyRate: number | null
}

export interface MissingPriceField {
  table: string
  field: string
  why_needed: string
  example_values: string[]
}

export type ResolvedAmount = number | { missing: MissingPriceField }

export function isMissingPrice(v: ResolvedAmount): v is { missing: MissingPriceField } {
  return typeof v === 'object' && v !== null && 'missing' in v
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * The single source of truth for what one student owes for one lesson, before
 * subscription coverage and before cancellation-policy scaling.
 *
 * Every billing path goes through here — the monthly engine (lessons and
 * cancellations) and the real-time charge paths — so a lesson can never be
 * priced one way when it is marked completed and another way at month end.
 *
 * Individual lessons scale by duration; pair/group/custom are flat per student.
 * Custom has no org default on purpose: a custom lesson without a price is a
 * loud failure, never a silently guessed amount.
 */
export function resolveLessonBaseAmount(
  lesson: PricedLessonInput,
  pricing: OrgPricing
): ResolvedAmount {
  switch (lesson.lessonType) {
    case 'individual': {
      const rate = lesson.teacherHourlyRate ?? pricing.individualHourlyRate
      if (rate == null) {
        return {
          missing: {
            table: 'teachers',
            field: 'hourly_rate',
            why_needed:
              'Individual lesson requires the teacher hourly rate or an org default rate',
            example_values: ['150', '200'],
          },
        }
      }
      return round2(rate * (lesson.durationMinutes / 60))
    }

    case 'pair':
      return lesson.pricePerStudent ?? pricing.pairPricePerStudent

    case 'group':
      return lesson.pricePerStudent ?? pricing.groupPricePerStudent

    case 'custom': {
      if (lesson.pricePerStudent == null) {
        return {
          missing: {
            table: 'lessons',
            field: 'price_per_student',
            why_needed: 'Custom lesson requires an explicit per-student price',
            example_values: ['80', '150'],
          },
        }
      }
      return lesson.pricePerStudent
    }

    default:
      return {
        missing: {
          table: 'lessons',
          field: 'lesson_type',
          why_needed: `Unknown lesson type: ${lesson.lessonType}`,
          example_values: ['individual', 'pair', 'group', 'custom'],
        },
      }
  }
}

/** Lesson types priced per student, whose amount an active subscription covers. */
export const PER_STUDENT_LESSON_TYPES: readonly LessonType[] = ['pair', 'group', 'custom']

export function isPerStudentPriced(lessonType: LessonType): boolean {
  return PER_STUDENT_LESSON_TYPES.includes(lessonType)
}
