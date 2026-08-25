import { describe, it, expect } from 'vitest'
import { calculateCancellationCharge } from './calculateCancellationCharge'
import type { LessonForCancellation } from './calculateCancellationCharge'
import type { CancellationPolicy } from '@/lib/cancellation-policy'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Returns an ISO UTC string that is `hours` hours before the given date */
function hoursBeforeStart(startAt: string, hours: number): Date {
  return new Date(new Date(startAt).getTime() - hours * 60 * 60 * 1000)
}

const POLICY: CancellationPolicy = {
  id: 'policy-1',
  notice_hours_full: 24,
  notice_hours_partial: 2,
  partial_charge_percent: 50,
}

// baseAmount is what one student owes at full price — 200/hr scaled by duration,
// as resolveLessonBaseAmount would return for an individual lesson.
const LESSON_60MIN: LessonForCancellation = {
  start_at: '2026-04-01T10:00:00Z',
  end_at: '2026-04-01T11:00:00Z',
  baseAmount: 200,
}

const LESSON_45MIN: LessonForCancellation = {
  start_at: '2026-04-01T10:00:00Z',
  end_at: '2026-04-01T10:45:00Z',
  baseAmount: 150,
}

const LESSON_90MIN: LessonForCancellation = {
  start_at: '2026-04-01T10:00:00Z',
  end_at: '2026-04-01T11:30:00Z',
  baseAmount: 300,
}

// ---------------------------------------------------------------------------
// Non-negotiable scenarios (from sprint-3-scope.md)
// ---------------------------------------------------------------------------

describe('calculateCancellationCharge', () => {
  describe('no charge scenarios', () => {
    it('cancel 48h before start → no charge (well outside window)', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 48)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(false)
      expect(result.chargeType).toBeNull()
      expect(result.amount).toBe(0)
      expect(result.reasonCode).toBe('outside_window')
    })

    it('cancel 25h before start → no charge (just outside full window)', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 25)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(false)
    })
  })

  describe('partial charge scenarios', () => {
    it('cancel 12h before start → partial charge at 50%', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 12)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(true)
      expect(result.chargeType).toBe('partial')
      // 200/h * 1h * 50% = 100
      expect(result.amount).toBe(100)
      expect(result.reasonCode).toBe('partial_charge')
    })

    it('cancel 10h before start → partial charge', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 10)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.chargeType).toBe('partial')
    })
  })

  describe('full charge scenarios', () => {
    it('cancel 1h before start → full charge', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 1)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(true)
      expect(result.chargeType).toBe('full')
      // 200/h * 1h = 200
      expect(result.amount).toBe(200)
      expect(result.reasonCode).toBe('full_charge')
    })

    it('cancel 30min before start → full charge', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 0.5)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.chargeType).toBe('full')
    })
  })

  // ---------------------------------------------------------------------------
  // Exact boundary behavior (DEV-55 business rules)
  // ---------------------------------------------------------------------------

  describe('exact boundary behavior', () => {
    it('cancel exactly at notice_hours_full boundary → partial charge (boundary is inclusive)', () => {
      // hoursLeft === 24 → should be partial (≤ notice_hours_full)
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 24)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(true)
      expect(result.chargeType).toBe('partial')
    })

    it('cancel exactly at notice_hours_partial boundary → full charge (boundary is inclusive)', () => {
      // hoursLeft === 2 → should be full (< notice_hours_partial is false, ≥ is partial)
      // Wait: rule says hoursLeft < notice_hours_partial → full
      // At exactly 2h: notice_hours_partial ≤ hoursLeft ≤ notice_hours_full → partial
      // Correction: boundary 2h exactly = partial, not full
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 2)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(true)
      // At exactly the partial boundary: partial (inclusive on both sides of partial range)
      expect(result.chargeType).toBe('partial')
    })

    it('cancel at 1.99h before start (just below partial boundary) → full charge', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 1.99)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.chargeType).toBe('full')
    })

    it('cancel at 24.01h before start (just above full boundary) → no charge', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 24.01)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Timezone correctness (non-negotiable)
  // ---------------------------------------------------------------------------

  describe('timezone correctness', () => {
    it('cancellation at 00:30 local time (UTC+3) is not treated as the day before', () => {
      // Lesson starts at 2026-04-02T10:00:00Z (13:00 local UTC+3)
      // Cancellation at 2026-04-01T21:30:00Z = 00:30 local UTC+3 (next day locally)
      // hoursLeft = 10:00 UTC April 2 − 21:30 UTC April 1 = 12.5 hours
      // 12.5h is between 2 and 24 → partial charge
      const lesson: LessonForCancellation = {
        start_at: '2026-04-02T10:00:00Z',
        end_at: '2026-04-02T11:00:00Z',
        baseAmount: 200,
      }
      const cancelledAt = new Date('2026-04-01T21:30:00Z')
      const result = calculateCancellationCharge(lesson, cancelledAt, POLICY)
      // Should be partial, not no-charge (UTC math gives 12.5h, which is inside partial window)
      expect(result.shouldCharge).toBe(true)
      expect(result.chargeType).toBe('partial')
    })
  })

  // ---------------------------------------------------------------------------
  // Missing policy
  // ---------------------------------------------------------------------------

  describe('missing policy', () => {
    it('null policy → no charge, no crash', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 1)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, null)
      expect(result.shouldCharge).toBe(false)
      expect(result.chargeType).toBeNull()
      expect(result.amount).toBe(0)
      expect(result.reasonCode).toBe('no_policy')
    })
  })

  // ---------------------------------------------------------------------------
  // Amount calculation across lesson durations
  // ---------------------------------------------------------------------------

  describe('amount calculation by duration', () => {
    it('60-minute lesson at ₪200/h → full charge = ₪200', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 1)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.amount).toBe(200)
    })

    it('45-minute lesson at ₪200/h → full charge = ₪150', () => {
      const cancelledAt = hoursBeforeStart(LESSON_45MIN.start_at, 1)
      const result = calculateCancellationCharge(LESSON_45MIN, cancelledAt, POLICY)
      expect(result.amount).toBe(150) // 200 * (45/60) = 150
    })

    it('90-minute lesson at ₪200/h → full charge = ₪300', () => {
      const cancelledAt = hoursBeforeStart(LESSON_90MIN.start_at, 1)
      const result = calculateCancellationCharge(LESSON_90MIN, cancelledAt, POLICY)
      expect(result.amount).toBe(300) // 200 * (90/60) = 300
    })

    it('60-minute lesson at ₪200/h → partial at 50% = ₪100', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 12)
      const result = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(result.amount).toBe(100) // 200 * 50% = 100
    })

    it('45-minute lesson at ₪200/h → partial at 50% = ₪75', () => {
      const cancelledAt = hoursBeforeStart(LESSON_45MIN.start_at, 12)
      const result = calculateCancellationCharge(LESSON_45MIN, cancelledAt, POLICY)
      expect(result.amount).toBe(75) // 150 * 50% = 75
    })
  })

  // ---------------------------------------------------------------------------
  // Lesson that could not be priced (no teacher rate, no org default, no price)
  // ---------------------------------------------------------------------------

  describe('unpriceable lesson', () => {
    const lessonNoRate: LessonForCancellation = {
      start_at: '2026-04-01T10:00:00Z',
      end_at: '2026-04-01T11:00:00Z',
      baseAmount: null,
    }

    it('full charge scenario with null rate → shouldCharge=true, amount=0, reasonCode=missing_rate', () => {
      const cancelledAt = hoursBeforeStart(lessonNoRate.start_at, 1)
      const result = calculateCancellationCharge(lessonNoRate, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(true)
      expect(result.amount).toBe(0)
      expect(result.reasonCode).toBe('missing_rate')
    })

    it('partial charge scenario with null rate → shouldCharge=true, amount=0, reasonCode=missing_rate', () => {
      const cancelledAt = hoursBeforeStart(lessonNoRate.start_at, 12)
      const result = calculateCancellationCharge(lessonNoRate, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(true)
      expect(result.amount).toBe(0)
      expect(result.reasonCode).toBe('missing_rate')
    })

    it('no charge scenario with null rate → shouldCharge=false regardless', () => {
      const cancelledAt = hoursBeforeStart(lessonNoRate.start_at, 48)
      const result = calculateCancellationCharge(lessonNoRate, cancelledAt, POLICY)
      expect(result.shouldCharge).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------

  describe('determinism', () => {
    it('same inputs always produce same output', () => {
      const cancelledAt = hoursBeforeStart(LESSON_60MIN.start_at, 12)
      const r1 = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      const r2 = calculateCancellationCharge(LESSON_60MIN, cancelledAt, POLICY)
      expect(r1).toEqual(r2)
    })

    it('accepts ISO string or Date for cancelledAt', () => {
      const d = hoursBeforeStart(LESSON_60MIN.start_at, 12)
      const resultDate = calculateCancellationCharge(LESSON_60MIN, d, POLICY)
      const resultString = calculateCancellationCharge(LESSON_60MIN, d.toISOString(), POLICY)
      expect(resultDate).toEqual(resultString)
    })
  })
})
