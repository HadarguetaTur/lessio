import type { LessonType } from '@/lib/lessons/types'
import type { OrgPricing } from '@/lib/organizations/pricing'

/**
 * The two per-student pricing fields on `students`. Kept as one struct so every
 * billing path threads both or neither — a path that applies the personal rate
 * but forgets the discount bills the wrong number.
 */
export interface StudentPricing {
  /** Personal hourly rate for individual lessons; overrides the teacher's. Null = inherit. */
  hourlyRate: number | null
  /** 0–100, taken off the resolved per-student amount. Null = none. */
  discountPercent: number | null
}

export const NO_STUDENT_PRICING: StudentPricing = { hourlyRate: null, discountPercent: null }

/** Reads the two pricing columns off a `students` row (or an embedded join); a missing row means "inherit". */
export function toStudentPricing(
  row:
    | { hourly_rate?: number | string | null; discount_percent?: number | string | null }
    | null
    | undefined
): StudentPricing {
  if (!row) return NO_STUDENT_PRICING
  return {
    hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
    discountPercent: row.discount_percent == null ? null : Number(row.discount_percent),
  }
}

export interface PricedLessonInput {
  lessonType: LessonType
  /** Per-lesson override (pair/group) or the required price (custom). */
  pricePerStudent: number | null
  durationMinutes: number
  /** The lesson teacher's personal rate; overrides the org default. */
  teacherHourlyRate: number | null
  /** The attending student's personal rate; overrides the teacher's. */
  studentHourlyRate?: number | null
  /** The attending student's discount, applied last to every lesson type. */
  studentDiscountPercent?: number | null
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
 * Apply a student's percentage discount to a resolved amount. Exported so a
 * path that already has a base amount (the cancellation preview) discounts by
 * the same rounding rule as the resolver.
 */
export function applyStudentDiscount(amount: number, discountPercent: number | null | undefined): number {
  if (discountPercent == null || discountPercent <= 0) return amount
  const pct = Math.min(discountPercent, 100)
  return round2(amount * (1 - pct / 100))
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
 *
 * Per-student pricing: the student's own hourly rate wins over the teacher's
 * for individual lessons, and the student's discount is applied last, to every
 * lesson type.
 */
export function resolveLessonBaseAmount(
  lesson: PricedLessonInput,
  pricing: OrgPricing
): ResolvedAmount {
  const base = resolveUndiscountedAmount(lesson, pricing)
  if (isMissingPrice(base)) return base
  return applyStudentDiscount(base, lesson.studentDiscountPercent)
}

function resolveUndiscountedAmount(
  lesson: PricedLessonInput,
  pricing: OrgPricing
): ResolvedAmount {
  switch (lesson.lessonType) {
    case 'individual': {
      const rate =
        lesson.studentHourlyRate ?? lesson.teacherHourlyRate ?? pricing.individualHourlyRate
      if (rate == null) {
        return {
          missing: {
            table: 'teachers',
            field: 'hourly_rate',
            why_needed:
              'Individual lesson requires a student, teacher or org default hourly rate',
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

/**
 * Fallback coverage set, matching the DB default of
 * organizations.subscription_covered_lesson_types. Orgs override it at
 * /settings/billing-policy; this only applies to rows written before that column existed.
 */
export const DEFAULT_SUBSCRIPTION_COVERED_LESSON_TYPES: readonly LessonType[] = [
  'pair',
  'group',
  'custom',
]

/**
 * Is this lesson's attendance already paid for by the student's subscription?
 * Covered means no per-lesson charge at all — the monthly engine bills 0 and the
 * real-time path writes no charge row.
 */
export function isLessonCoveredBySubscription(
  lessonType: LessonType,
  coveredTypes: readonly LessonType[],
  hasActiveSubscription: boolean
): boolean {
  return hasActiveSubscription && coveredTypes.includes(lessonType)
}
