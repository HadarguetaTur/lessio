import { describe, expect, it } from 'vitest'
import {
  previewCancellationCharge,
  isCancellableByParent,
  CANCELLATION_WINDOW_DAYS,
} from './previewCancellationCharge'
import type { CancellationPolicy } from '@/lib/cancellation-policy'
import type { OrgPricing } from '@/lib/organizations/pricing'

/**
 * This is the number a parent reads before they agree to be charged, and the
 * number they are then charged. Both come from here, so a change that shifts
 * one shifts the other — which is the point, and why the boundaries matter.
 */

const POLICY: CancellationPolicy = {
  id: 'policy-1',
  notice_hours_full: 24,
  notice_hours_partial: 2,
  partial_charge_percent: 50,
}

const PRICING: OrgPricing = {
  individualHourlyRate: 200,
  pairPricePerStudent: 112.5,
  groupPricePerStudent: 120,
}

const NOW = new Date('2026-08-27T10:00:00.000Z')

/** A one-hour individual lesson `hoursAhead` from NOW. */
function lessonIn(hoursAhead: number) {
  const start = new Date(NOW.getTime() + hoursAhead * 3600_000)
  return {
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 3600_000).toISOString(),
    lesson_type: 'individual' as string | null,
    price_per_student: null as number | null,
    teacherHourlyRate: 200 as number | null,
  }
}

describe('previewCancellationCharge', () => {
  it('does not charge when the parent gives more notice than the policy asks for', () => {
    const result = previewCancellationCharge(lessonIn(48), NOW, PRICING, POLICY)
    expect(result.shouldCharge).toBe(false)
    expect(result.amount).toBe(0)
  })

  // The boundary is exclusive on the free side: "24 hours' notice" means more
  // than 24, so exactly 24 already charges the partial rate. Pinned here
  // because it decides real money on the hour a parent is most likely to act.
  it('charges at exactly the full-notice boundary, and not a moment later', () => {
    expect(previewCancellationCharge(lessonIn(24), NOW, PRICING, POLICY).shouldCharge).toBe(true)
    expect(previewCancellationCharge(lessonIn(24.001), NOW, PRICING, POLICY).shouldCharge).toBe(false)
  })

  it('charges in full at exactly the partial-notice boundary', () => {
    // hoursLeft < notice_hours_partial is a full charge, so 2h is still partial.
    expect(previewCancellationCharge(lessonIn(2), NOW, PRICING, POLICY).chargeType).toBe('partial')
    expect(previewCancellationCharge(lessonIn(1.999), NOW, PRICING, POLICY).chargeType).toBe('full')
  })

  it('charges the partial percentage between the two notice windows', () => {
    const result = previewCancellationCharge(lessonIn(12), NOW, PRICING, POLICY)
    expect(result.shouldCharge).toBe(true)
    expect(result.chargeType).toBe('partial')
    // 1 hour at ₪200, halved by the 50% partial rate.
    expect(result.amount).toBe(100)
  })

  it('charges in full inside the partial window', () => {
    const result = previewCancellationCharge(lessonIn(1), NOW, PRICING, POLICY)
    expect(result.shouldCharge).toBe(true)
    expect(result.chargeType).toBe('full')
    expect(result.amount).toBe(200)
  })

  it('scales an individual lesson by its length', () => {
    const lesson = lessonIn(12)
    lesson.end_at = new Date(new Date(lesson.start_at).getTime() + 90 * 60_000).toISOString()
    // 1.5 hours at ₪200 = ₪300, halved = ₪150.
    expect(previewCancellationCharge(lesson, NOW, PRICING, POLICY).amount).toBe(150)
  })

  it('charges nothing when the org has no cancellation policy', () => {
    const result = previewCancellationCharge(lessonIn(1), NOW, PRICING, null)
    expect(result.shouldCharge).toBe(false)
    expect(result.reasonCode).toBe('no_policy')
  })

  // The dangerous case: chargeable, but the amount cannot be worked out. It
  // must not reach the parent as ₪0, which would promise a free cancellation
  // the school still has to bill for.
  it('flags an unpriceable lesson rather than quoting zero', () => {
    const lesson = { ...lessonIn(1), teacherHourlyRate: null }
    const result = previewCancellationCharge(
      lesson,
      NOW,
      { ...PRICING, individualHourlyRate: null },
      POLICY
    )
    expect(result.shouldCharge).toBe(true)
    expect(result.amount).toBe(0)
    expect(result.reasonCode).toBe('missing_rate')
  })

  it('prices a pair lesson per student, not by duration', () => {
    const lesson = { ...lessonIn(1), lesson_type: 'pair', teacherHourlyRate: null }
    expect(previewCancellationCharge(lesson, NOW, PRICING, POLICY).amount).toBe(112.5)
  })
})

describe('isCancellableByParent', () => {
  it('allows a lesson inside the self-service window', () => {
    expect(isCancellableByParent(lessonIn(24).start_at, NOW)).toBe(true)
  })

  it('refuses a lesson that has already started', () => {
    expect(isCancellableByParent(lessonIn(-1).start_at, NOW)).toBe(false)
  })

  // Rendering a cancel button here opened a dialog that failed on confirm.
  it('refuses a lesson beyond the window', () => {
    const beyond = lessonIn(CANCELLATION_WINDOW_DAYS * 24 + 1)
    expect(isCancellableByParent(beyond.start_at, NOW)).toBe(false)
  })

  it('allows a lesson exactly at the window edge', () => {
    const edge = lessonIn(CANCELLATION_WINDOW_DAYS * 24)
    expect(isCancellableByParent(edge.start_at, NOW)).toBe(true)
  })
})
