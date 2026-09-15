import { describe, expect, it } from 'vitest'
import { calculateTeacherEconomics, resolveCompensationPolicy, type CompensationPolicy, type EconomicsLesson } from './calculator'

const basePolicy: CompensationPolicy = {
  id: 'org-policy-v1',
  scope: 'organization',
  model: 'hourly',
  hourlyAmount: 100,
  noShowPercent: 50,
  lateParentCancellationPercent: 25,
  requiresConfirmation: false,
  effectiveFrom: '2026-01-01T00:00:00.000Z',
}

function lesson(overrides: Partial<EconomicsLesson> = {}): EconomicsLesson {
  return {
    id: 'lesson-1',
    teacherId: 'teacher-1',
    startAt: '2026-09-15T15:00:00.000Z',
    endAt: '2026-09-15T16:30:00.000Z',
    status: 'completed',
    lessonType: 'individual',
    enrolledStudentCount: 1,
    attributedRevenue: 300,
    revenueBasis: 'list_price',
    deliveryConfirmedAt: '2026-09-15T16:30:00.000Z',
    deliveryConfirmationSource: 'teacher',
    ...overrides,
  }
}

const tz = 'Asia/Jerusalem'

describe('resolveCompensationPolicy', () => {
  it('uses the teacher override active at the lesson local start', () => {
    const override = { ...basePolicy, id: 'teacher-v2', scope: 'teacher' as const, teacherId: 'teacher-1', hourlyAmount: 150, effectiveFrom: '2026-09-15T00:00:00.000Z' }
    expect(resolveCompensationPolicy([basePolicy, override], 'teacher-1', lesson().startAt, tz)?.id).toBe('teacher-v2')
  })

  it('keeps an earlier lesson on the earlier policy version', () => {
    const later = { ...basePolicy, id: 'org-v2', hourlyAmount: 200, effectiveFrom: '2026-09-16T00:00:00.000Z' }
    expect(resolveCompensationPolicy([basePolicy, later], 'teacher-1', lesson().startAt, tz)?.id).toBe(basePolicy.id)
  })
})

describe('calculateTeacherEconomics', () => {
  it('calculates hourly compensation, contribution and contribution rate', () => {
    const result = calculateTeacherEconomics([lesson()], [basePolicy], tz)
    expect(result).toMatchObject({ deliveryCount: 1, deliveryHours: 1.5, attributedRevenue: 300, estimatedCompensation: 150, contribution: 150, contributionRate: 50 })
  })

  it('supports fixed, percentage, and group participant models', () => {
    const fixed = { ...basePolicy, id: 'fixed', model: 'fixed_per_lesson' as const, hourlyAmount: null, fixedAmount: 80 }
    const percentage = { ...basePolicy, id: 'percent', model: 'percentage_revenue' as const, hourlyAmount: null, revenuePercent: 20 }
    const group = { ...basePolicy, id: 'group', model: 'base_plus_participant' as const, hourlyAmount: null, fixedAmount: 50, baseRateType: 'fixed_per_lesson' as const, participantAmount: 15 }
    expect(calculateTeacherEconomics([lesson()], [fixed], tz).estimatedCompensation).toBe(80)
    expect(calculateTeacherEconomics([lesson()], [percentage], tz).estimatedCompensation).toBe(60)
    expect(calculateTeacherEconomics([lesson({ enrolledStudentCount: 3 })], [group], tz).estimatedCompensation).toBe(80)
  })

  it('applies no-show and late parent cancellation policy; teacher, staff and early parent cancellations are zero', () => {
    const cancelled = (overrides: Partial<EconomicsLesson>) =>
      calculateTeacherEconomics([lesson({ status: 'cancelled', attributedRevenue: 0, revenueBasis: 'none', deliveryConfirmedAt: null, ...overrides })], [basePolicy], tz)
    expect(calculateTeacherEconomics([lesson({ status: 'no_show', attributedRevenue: 0, revenueBasis: 'not_billed', deliveryConfirmedAt: null })], [basePolicy], tz).estimatedCompensation).toBe(75)
    expect(cancelled({ cancellationActor: 'parent', lateParentCancellation: true }).estimatedCompensation).toBe(37.5)
    expect(cancelled({ cancellationActor: 'parent', lateParentCancellation: false }).estimatedCompensation).toBe(0)
    expect(cancelled({ cancellationActor: 'teacher', lateParentCancellation: true }).estimatedCompensation).toBe(0)
    expect(cancelled({ cancellationActor: 'staff' }).estimatedCompensation).toBe(0)
  })

  it('accepts a completed lesson operationally unless the policy requires a confirmation that has not arrived', () => {
    const requiring = { ...basePolicy, requiresConfirmation: true }
    const unconfirmed = lesson({ deliveryConfirmedAt: null, deliveryConfirmationSource: 'automatic' })
    const awaiting = calculateTeacherEconomics([unconfirmed], [requiring], tz)
    expect(awaiting.confirmationState).toBe('estimated')
    expect(awaiting.attention.awaitingConfirmation).toBe(1)
    expect(awaiting.lines[0].warnings).toEqual(['awaiting_confirmation'])

    const accepted = calculateTeacherEconomics([unconfirmed], [basePolicy], tz)
    expect(accepted.confirmationState).toBe('confirmed')
    expect(accepted.attention.awaitingConfirmation).toBe(0)
  })

  it('flags cancellations with unknown or staff provenance for review', () => {
    const unknown = calculateTeacherEconomics([lesson({ status: 'cancelled', attributedRevenue: 0, cancellationActor: 'unknown' })], [basePolicy], tz)
    expect(unknown.confirmationState).toBe('estimated')
    expect(unknown.attention.unknownCancellation).toBe(1)
    const staff = calculateTeacherEconomics([lesson({ status: 'cancelled', attributedRevenue: 0, cancellationActor: 'staff' })], [basePolicy], tz)
    expect(staff.attention.staffCancellation).toBe(1)
    expect(staff.lines[0].warnings).toEqual(['staff_cancellation'])
  })

  it('carries sourcing warnings (missing price, no students) into the line state', () => {
    const result = calculateTeacherEconomics([lesson({ warnings: ['missing_price'], attributedRevenue: 0 }), lesson({ id: 'lesson-2', warnings: ['no_students'], enrolledStudentCount: 0, attributedRevenue: 0 })], [basePolicy], tz)
    expect(result.confirmationState).toBe('estimated')
    expect(result.attention.missingPrice).toBe(1)
    expect(result.attention.noStudents).toBe(1)
  })

  it('returns null compensation and contribution when a delivered lesson has no policy', () => {
    const missing = calculateTeacherEconomics([lesson(), lesson({ id: 'lesson-2', teacherId: 'teacher-1' })], [], tz)
    expect(missing.confirmationState).toBe('missing_policy')
    expect(missing.missingPolicyWarnings).toEqual(['lesson-1', 'lesson-2'])
    expect(missing.attributedRevenue).toBe(600)
    expect(missing.estimatedCompensation).toBeNull()
    expect(missing.contribution).toBeNull()
    expect(missing.contributionRate).toBeNull()
    expect(missing.lines[0]).toMatchObject({ estimatedCompensation: null, contribution: null, policyId: null })
  })

  it('excludes scheduled lessons from revenue, counts and attention, and rounds money to cents', () => {
    const result = calculateTeacherEconomics(
      [lesson({ status: 'scheduled', attributedRevenue: 999, deliveryConfirmedAt: null }), lesson({ id: 'lesson-2', attributedRevenue: 100.005 })],
      [basePolicy],
      tz
    )
    expect(result.deliveryCount).toBe(1)
    expect(result.attributedRevenue).toBe(100.01)
    expect(result.estimatedCompensation).toBe(150)
    expect(result.lines[0]).toMatchObject({ estimatedCompensation: 0, revenueBasis: 'none', warnings: [] })
  })
})
