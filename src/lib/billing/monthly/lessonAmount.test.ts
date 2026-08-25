import { describe, it, expect } from 'vitest'
import { calculateLessonAmount, calculateLessonsContribution } from './lessonAmount'
import { isMissingFieldsError } from './types'
import type { LessonRow, SubscriptionRow } from './types'
import type { OrgPricing } from '@/lib/organizations/pricing'

const TZ = 'Asia/Jerusalem'

const PRICING: OrgPricing = {
  individualHourlyRate: null,
  pairPricePerStudent: 112.5,
  groupPricePerStudent: 120,
}

function lesson(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'lesson-1',
    start_at: '2026-04-08T07:00:00.000Z',
    end_at: '2026-04-08T08:00:00.000Z',
    status: 'scheduled',
    lesson_type: 'individual',
    price_per_student: null,
    teacher: { id: 'teacher-1', hourly_rate: 200 },
    ...overrides,
  }
}

/** An unpaused subscription covering April 2026. */
const APRIL_SUB: SubscriptionRow = {
  id: 'sub-1',
  organization_id: 'org-1',
  student_id: 'student-1',
  subscription_type: 'monthly',
  monthly_amount: 600,
  start_date: '2026-01-01',
  end_date: null,
  is_paused: false,
  pause_date: null,
}

function amountOf(result: number | object): number {
  if (typeof result === 'object') throw new Error('expected an amount, got MissingFieldsError')
  return result
}

describe('calculateLessonAmount', () => {
  it('prices an individual lesson from the teacher rate and duration', () => {
    const result = calculateLessonAmount(lesson(), 'student-1', [], TZ, 1, PRICING)
    expect(amountOf(result)).toBe(200)
  })

  it('falls back to the org rate when the teacher has none', () => {
    const result = calculateLessonAmount(
      lesson({ teacher: { id: 'teacher-1', hourly_rate: null } }),
      'student-1',
      [],
      TZ,
      1,
      { ...PRICING, individualHourlyRate: 150 }
    )
    expect(amountOf(result)).toBe(150)
  })

  it('still refuses an individual lesson with several students', () => {
    const result = calculateLessonAmount(lesson(), 'student-1', [], TZ, 2, PRICING)
    expect(isMissingFieldsError(result)).toBe(true)
  })

  it('prices a pair lesson from the org default', () => {
    const result = calculateLessonAmount(
      lesson({ lesson_type: 'pair' }),
      'student-1',
      [],
      TZ,
      2,
      PRICING
    )
    expect(amountOf(result)).toBe(112.5)
  })

  it('prices a custom lesson from the price on the lesson', () => {
    const result = calculateLessonAmount(
      lesson({ lesson_type: 'custom', price_per_student: 85 }),
      'student-1',
      [],
      TZ,
      3,
      PRICING
    )
    expect(amountOf(result)).toBe(85)
  })

  it('fails loudly for a custom lesson with no price', () => {
    const result = calculateLessonAmount(
      lesson({ lesson_type: 'custom', price_per_student: null }),
      'student-1',
      [],
      TZ,
      3,
      PRICING
    )
    expect(isMissingFieldsError(result)).toBe(true)
    if (isMissingFieldsError(result)) {
      expect(result.MISSING_FIELDS[0].field).toBe('price_per_student')
    }
  })

  it('zeroes a custom lesson for a student on an active subscription', () => {
    const result = calculateLessonAmount(
      lesson({ lesson_type: 'custom', price_per_student: 85 }),
      'student-1',
      [APRIL_SUB],
      TZ,
      3,
      PRICING
    )
    expect(amountOf(result)).toBe(0)
  })

  it('bills an individual lesson even when the student has a subscription', () => {
    const result = calculateLessonAmount(lesson(), 'student-1', [APRIL_SUB], TZ, 1, PRICING)
    expect(amountOf(result)).toBe(200)
  })
})

describe('calculateLessonsContribution', () => {
  const counts = new Map([['lesson-1', 2]])

  it('counts a billed pair lesson', () => {
    const result = calculateLessonsContribution(
      [lesson({ lesson_type: 'pair' })],
      '2026-04',
      'student-1',
      [],
      TZ,
      new Set(),
      counts,
      PRICING
    )
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.lessonsTotal).toBe(112.5)
    expect(result.lessonsCount).toBe(1)
  })

  it('leaves a subscription-covered custom lesson out of the count', () => {
    const result = calculateLessonsContribution(
      [lesson({ lesson_type: 'custom', price_per_student: 85 })],
      '2026-04',
      'student-1',
      [APRIL_SUB],
      TZ,
      new Set(),
      counts,
      PRICING
    )
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.lessonsTotal).toBe(0)
    expect(result.lessonsCount).toBe(0)
  })

  it('propagates the missing price of one custom lesson to the whole month', () => {
    const result = calculateLessonsContribution(
      [lesson({ lesson_type: 'custom', price_per_student: null })],
      '2026-04',
      'student-1',
      [],
      TZ,
      new Set(),
      counts,
      PRICING
    )
    expect(isMissingFieldsError(result)).toBe(true)
  })
})
