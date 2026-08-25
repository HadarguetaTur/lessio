import { describe, it, expect } from 'vitest'
import { calculateCancellationsContribution } from './cancellations'
import { isMissingFieldsError } from './types'
import type { CancellationEventRow, LessonRow, SubscriptionRow } from './types'
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
    status: 'cancelled',
    lesson_type: 'individual',
    price_per_student: null,
    teacher: { id: 'teacher-1', hourly_rate: 200 },
    ...overrides,
  }
}

/** A late cancellation the admin has confirmed as chargeable. */
function event(overrides: Partial<CancellationEventRow> = {}): CancellationEventRow {
  return {
    id: 'event-1',
    lesson_id: 'lesson-1',
    student_id: 'student-1',
    cancellation_date: '2026-04-08',
    hours_before: 3,
    is_lt_24h: true,
    is_charged: true,
    charge_override: null,
    billing_month: '2026-04',
    ...overrides,
  }
}

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

function run(
  events: CancellationEventRow[],
  lessons: LessonRow[],
  subscriptions: SubscriptionRow[] = []
) {
  const lookup = new Map(lessons.map((l) => [l.id, l]))
  return calculateCancellationsContribution(events, lookup, subscriptions, TZ, PRICING)
}

describe('calculateCancellationsContribution', () => {
  it('charges an individual cancellation at rate × duration', () => {
    const result = run([event()], [lesson()])
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.cancellationsTotal).toBe(200)
    expect(result.cancellationsCount).toBe(1)
  })

  it('charges a pair cancellation at the org per-student price', () => {
    const result = run([event()], [lesson({ lesson_type: 'pair' })])
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.cancellationsTotal).toBe(112.5)
  })

  it('charges a custom cancellation at the price on the lesson', () => {
    const result = run(
      [event()],
      [lesson({ lesson_type: 'custom', price_per_student: 85 })]
    )
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.cancellationsTotal).toBe(85)
  })

  it('honours an explicit override ahead of any lesson pricing', () => {
    const result = run(
      [event({ charge_override: 40 })],
      [lesson({ lesson_type: 'custom', price_per_student: null })]
    )
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.cancellationsTotal).toBe(40)
  })

  it('zeroes a custom cancellation covered by an active subscription', () => {
    const result = run(
      [event()],
      [lesson({ lesson_type: 'custom', price_per_student: 85 })],
      [APRIL_SUB]
    )
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.cancellationsTotal).toBe(0)
    expect(result.cancellationsCount).toBe(0)
  })

  it('fails loudly for a custom cancellation with no price', () => {
    const result = run(
      [event()],
      [lesson({ lesson_type: 'custom', price_per_student: null })]
    )
    expect(isMissingFieldsError(result)).toBe(true)
  })

  it('counts an unconfirmed cancellation as pending and charges nothing', () => {
    const result = run([event({ is_charged: false })], [lesson({ lesson_type: 'pair' })])
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.pendingCancellationsCount).toBe(1)
    expect(result.cancellationsTotal).toBe(0)
  })

  it('does not charge a cancellation made more than 24h ahead', () => {
    const result = run([event({ is_lt_24h: false })], [lesson({ lesson_type: 'pair' })])
    if (isMissingFieldsError(result)) throw new Error('unexpected MissingFieldsError')
    expect(result.cancellationsTotal).toBe(0)
    expect(result.cancellationsCount).toBe(0)
  })
})
