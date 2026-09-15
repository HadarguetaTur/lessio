import { describe, expect, it } from 'vitest'
import { attributeLessonRevenue, cancellationActorFromSource } from './report'
import type { OrgPricing } from '@/lib/organizations/pricing'
import type { CancellationPolicy } from '@/lib/cancellation-policy'

const pricing: OrgPricing = {
  individualHourlyRate: 150,
  pairPricePerStudent: 90,
  groupPricePerStudent: 60,
  subscriptionCoveredLessonTypes: ['individual', 'pair', 'group', 'custom'],
}

const policy: CancellationPolicy = { id: 'cp', notice_hours_full: 24, notice_hours_partial: 2, partial_charge_percent: 50 }

type Row = Parameters<typeof attributeLessonRevenue>[0]

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'lesson-1',
    teacher_id: 'teacher-1',
    status: 'completed',
    start_at: '2026-09-15T15:00:00.000Z',
    end_at: '2026-09-15T16:00:00.000Z',
    lesson_type: 'individual',
    price_per_student: null,
    cancelled_at: null,
    cancellation_source: null,
    delivery_confirmed_at: null,
    delivery_confirmation_source: null,
    lesson_students: [{ student_id: 'student-1', students: { full_name: 'דנה', hourly_rate: null, discount_percent: null } }],
    teachers: { hourly_rate: 175, profiles: { full_name: 'מורה' } },
    charges: [],
    ...overrides,
  }
}

const ctx = (extra: Partial<Parameters<typeof attributeLessonRevenue>[1]> = {}) => ({
  pricing,
  cancellationPolicy: policy,
  subscriptions: [],
  timezone: 'Asia/Jerusalem',
  ...extra,
})

describe('attributeLessonRevenue', () => {
  it('prices a completed lesson at list value even when no charge row exists (subscription org)', () => {
    const result = attributeLessonRevenue(row(), ctx({ subscriptions: [{ student_id: 'student-1', start_date: '2026-01-01', end_date: null, is_paused: false }] }))
    expect(result).toMatchObject({ attributedRevenue: 175, revenueBasis: 'list_price', subscriptionCovered: true, warnings: [] })
  })

  it('sums every enrolled student for pair and group lessons, applying student discounts', () => {
    const result = attributeLessonRevenue(
      row({
        lesson_type: 'group',
        lesson_students: [
          { student_id: 's1', students: { full_name: 'a', hourly_rate: null, discount_percent: null } },
          { student_id: 's2', students: { full_name: 'b', hourly_rate: null, discount_percent: 50 } },
        ],
      }),
      ctx()
    )
    expect(result.attributedRevenue).toBe(90)
    expect(result.subscriptionCovered).toBe(false)
  })

  it('flags a missing price instead of failing the report', () => {
    const result = attributeLessonRevenue(row({ lesson_type: 'custom', price_per_student: null }), ctx())
    expect(result).toMatchObject({ attributedRevenue: 0, revenueBasis: 'list_price', warnings: ['missing_price'] })
  })

  it('attributes nothing to a no-show, which the centre does not bill', () => {
    expect(attributeLessonRevenue(row({ status: 'no_show' }), ctx())).toMatchObject({ attributedRevenue: 0, revenueBasis: 'not_billed' })
  })

  it('prices a late parent cancellation by the cancellation policy window', () => {
    const late = attributeLessonRevenue(row({ status: 'cancelled', cancellation_source: 'portal', cancelled_at: '2026-09-15T14:00:00.000Z' }), ctx())
    expect(late).toMatchObject({ attributedRevenue: 175, revenueBasis: 'cancellation_policy', lateParentCancellation: true })

    const partial = attributeLessonRevenue(row({ status: 'cancelled', cancellation_source: 'whatsapp', cancelled_at: '2026-09-15T05:00:00.000Z' }), ctx())
    expect(partial).toMatchObject({ attributedRevenue: 87.5, lateParentCancellation: true })

    const early = attributeLessonRevenue(row({ status: 'cancelled', cancellation_source: 'parent', cancelled_at: '2026-09-10T05:00:00.000Z' }), ctx())
    expect(early).toMatchObject({ attributedRevenue: 0, revenueBasis: 'none', lateParentCancellation: false })
  })

  it('prefers a recorded cancellation charge over the policy estimate', () => {
    const result = attributeLessonRevenue(
      row({ status: 'cancelled', cancellation_source: 'parent', cancelled_at: '2026-09-10T05:00:00.000Z', charges: [{ amount: 60, charge_type: 'cancellation', status: 'pending' }, { amount: 999, charge_type: 'cancellation', status: 'voided' }] }),
      ctx()
    )
    expect(result).toMatchObject({ attributedRevenue: 60, revenueBasis: 'cancellation_charge', lateParentCancellation: true })
  })

  it('attributes nothing to teacher cancellations and warns when a parent cancellation cannot be priced', () => {
    expect(attributeLessonRevenue(row({ status: 'cancelled', cancellation_source: 'teacher', cancelled_at: '2026-09-15T14:00:00.000Z' }), ctx())).toMatchObject({ attributedRevenue: 0, revenueBasis: 'none', warnings: [] })
    expect(attributeLessonRevenue(row({ status: 'cancelled', cancellation_source: 'parent', cancelled_at: '2026-09-15T14:00:00.000Z' }), ctx({ cancellationPolicy: null })).warnings).toEqual(['no_cancellation_policy'])
  })
})

describe('cancellationActorFromSource', () => {
  it('treats portal and WhatsApp cancellations as the parent', () => {
    expect(cancellationActorFromSource('portal')).toBe('parent')
    expect(cancellationActorFromSource('whatsapp')).toBe('parent')
    expect(cancellationActorFromSource('parent')).toBe('parent')
    expect(cancellationActorFromSource('teacher')).toBe('teacher')
    expect(cancellationActorFromSource('staff')).toBe('staff')
    expect(cancellationActorFromSource(null)).toBe('unknown')
  })
})
