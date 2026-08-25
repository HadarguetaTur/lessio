import { describe, it, expect } from 'vitest'
import { resolveLessonBaseAmount, isMissingPrice, isPerStudentPriced } from './lessonPricing'
import type { OrgPricing } from '@/lib/organizations/pricing'

const PRICING: OrgPricing = {
  individualHourlyRate: 180,
  pairPricePerStudent: 112.5,
  groupPricePerStudent: 120,
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

describe('isPerStudentPriced', () => {
  it('covers the types a subscription pays for, and not individual', () => {
    expect(isPerStudentPriced('pair')).toBe(true)
    expect(isPerStudentPriced('group')).toBe(true)
    expect(isPerStudentPriced('custom')).toBe(true)
    expect(isPerStudentPriced('individual')).toBe(false)
  })
})
