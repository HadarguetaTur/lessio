import { describe, it, expect } from 'vitest'
import {
  resolveLessonBaseAmount,
  applyStudentDiscount,
  isMissingPrice,
  isLessonCoveredBySubscription,
  DEFAULT_SUBSCRIPTION_COVERED_LESSON_TYPES,
} from './lessonPricing'
import type { OrgPricing } from '@/lib/organizations/pricing'

const PRICING: OrgPricing = {
  individualHourlyRate: 180,
  pairPricePerStudent: 112.5,
  groupPricePerStudent: 120,
  subscriptionCoveredLessonTypes: DEFAULT_SUBSCRIPTION_COVERED_LESSON_TYPES,
}

const NO_ORG_RATE: OrgPricing = { ...PRICING, individualHourlyRate: null }

function amount(result: ReturnType<typeof resolveLessonBaseAmount>): number {
  if (isMissingPrice(result)) throw new Error(`expected an amount, got missing ${result.missing.field}`)
  return result
}

describe('resolveLessonBaseAmount', () => {
  describe('individual', () => {
    it("uses the teacher's own rate over the org default", () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'individual', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: 200 },
        PRICING
      )
      expect(amount(result)).toBe(200)
    })

    it('falls back to the org default when the teacher has no rate', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'individual', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: null },
        PRICING
      )
      expect(amount(result)).toBe(180)
    })

    it('scales by duration and rounds to agorot', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'individual', pricePerStudent: null, durationMinutes: 45, teacherHourlyRate: 150 },
        PRICING
      )
      expect(amount(result)).toBe(112.5)
    })

    it('reports a missing rate when neither the teacher nor the org has one', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'individual', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: null },
        NO_ORG_RATE
      )
      expect(isMissingPrice(result)).toBe(true)
      if (isMissingPrice(result)) expect(result.missing.field).toBe('hourly_rate')
    })
  })

  describe('pair and group', () => {
    it('uses the org default per-student price', () => {
      expect(
        amount(
          resolveLessonBaseAmount(
            { lessonType: 'pair', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: 200 },
            PRICING
          )
        )
      ).toBe(112.5)

      expect(
        amount(
          resolveLessonBaseAmount(
            { lessonType: 'group', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: 200 },
            PRICING
          )
        )
      ).toBe(120)
    })

    it('prefers the per-lesson override when one is set', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'pair', pricePerStudent: 90, durationMinutes: 60, teacherHourlyRate: 200 },
        PRICING
      )
      expect(amount(result)).toBe(90)
    })

    it('is flat regardless of duration', () => {
      const short = resolveLessonBaseAmount(
        { lessonType: 'group', pricePerStudent: null, durationMinutes: 45, teacherHourlyRate: 200 },
        PRICING
      )
      const long = resolveLessonBaseAmount(
        { lessonType: 'group', pricePerStudent: null, durationMinutes: 90, teacherHourlyRate: 200 },
        PRICING
      )
      expect(amount(short)).toBe(amount(long))
    })
  })

  describe('custom', () => {
    it('uses the price entered on the lesson', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'custom', pricePerStudent: 85, durationMinutes: 50, teacherHourlyRate: 200 },
        PRICING
      )
      expect(amount(result)).toBe(85)
    })

    it('never guesses a price — a custom lesson without one is a missing field', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'custom', pricePerStudent: null, durationMinutes: 50, teacherHourlyRate: 200 },
        PRICING
      )
      expect(isMissingPrice(result)).toBe(true)
      if (isMissingPrice(result)) {
        expect(result.missing.table).toBe('lessons')
        expect(result.missing.field).toBe('price_per_student')
      }
    })
  })

  describe('per-student pricing', () => {
    it("the student's own rate wins over the teacher's and the org's", () => {
      const result = resolveLessonBaseAmount(
        {
          lessonType: 'individual',
          pricePerStudent: null,
          durationMinutes: 60,
          teacherHourlyRate: 150,
          studentHourlyRate: 200,
        },
        PRICING
      )
      expect(amount(result)).toBe(200)
    })

    it('a student rate alone is enough when neither the teacher nor the org has one', () => {
      const result = resolveLessonBaseAmount(
        {
          lessonType: 'individual',
          pricePerStudent: null,
          durationMinutes: 60,
          teacherHourlyRate: null,
          studentHourlyRate: 170,
        },
        NO_ORG_RATE
      )
      expect(amount(result)).toBe(170)
    })

    it('the student rate does not touch flat-priced lesson types', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'pair', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: 150, studentHourlyRate: 500 },
        PRICING
      )
      expect(amount(result)).toBe(112.5)
    })

    it('discounts the resolved amount and rounds to agorot', () => {
      const individual = resolveLessonBaseAmount(
        { lessonType: 'individual', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: 150, studentDiscountPercent: 10 },
        PRICING
      )
      expect(amount(individual)).toBe(135)

      const custom = resolveLessonBaseAmount(
        { lessonType: 'custom', pricePerStudent: 85, durationMinutes: 50, teacherHourlyRate: null, studentDiscountPercent: 15 },
        PRICING
      )
      expect(amount(custom)).toBe(72.25)

      const group = resolveLessonBaseAmount(
        { lessonType: 'group', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: null, studentDiscountPercent: 33 },
        PRICING
      )
      expect(amount(group)).toBe(80.4)
    })

    it('a full discount prices the lesson at zero, never below', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'individual', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: 150, studentDiscountPercent: 100 },
        PRICING
      )
      expect(amount(result)).toBe(0)
      expect(applyStudentDiscount(100, 150)).toBe(0)
    })

    it('null, undefined and zero discount leave the amount alone', () => {
      expect(applyStudentDiscount(112.5, null)).toBe(112.5)
      expect(applyStudentDiscount(112.5, undefined)).toBe(112.5)
      expect(applyStudentDiscount(112.5, 0)).toBe(112.5)
    })

    it('still reports a missing rate rather than discounting nothing', () => {
      const result = resolveLessonBaseAmount(
        { lessonType: 'individual', pricePerStudent: null, durationMinutes: 60, teacherHourlyRate: null, studentDiscountPercent: 10 },
        NO_ORG_RATE
      )
      expect(isMissingPrice(result)).toBe(true)
    })
  })

  it('reports an unknown lesson type rather than pricing it', () => {
    const result = resolveLessonBaseAmount(
      // Simulates a row written by a future migration this build does not know about.
      { lessonType: 'workshop' as never, pricePerStudent: 50, durationMinutes: 60, teacherHourlyRate: 200 },
      PRICING
    )
    expect(isMissingPrice(result)).toBe(true)
    if (isMissingPrice(result)) expect(result.missing.field).toBe('lesson_type')
  })
})

describe('isLessonCoveredBySubscription', () => {
  const DEFAULT = DEFAULT_SUBSCRIPTION_COVERED_LESSON_TYPES

  it('covers the default types, and not individual', () => {
    expect(isLessonCoveredBySubscription('pair', DEFAULT, true)).toBe(true)
    expect(isLessonCoveredBySubscription('group', DEFAULT, true)).toBe(true)
    expect(isLessonCoveredBySubscription('custom', DEFAULT, true)).toBe(true)
    expect(isLessonCoveredBySubscription('individual', DEFAULT, true)).toBe(false)
  })

  it('covers nothing without an active subscription', () => {
    for (const type of DEFAULT) {
      expect(isLessonCoveredBySubscription(type, DEFAULT, false)).toBe(false)
    }
  })

  it('honours an org policy that covers individual lessons too', () => {
    const policy = ['individual', 'group'] as const
    expect(isLessonCoveredBySubscription('individual', policy, true)).toBe(true)
    expect(isLessonCoveredBySubscription('pair', policy, true)).toBe(false)
  })

  it('covers nothing when the policy is empty', () => {
    expect(isLessonCoveredBySubscription('group', [], true)).toBe(false)
  })
})
