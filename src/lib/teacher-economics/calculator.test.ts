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
    deliveryConfirmedAt: '2026-09-15T16:30:00.000Z',
    deliveryConfirmationSource: 'teacher',
    ...overrides,
  }
}

describe('resolveCompensationPolicy', () => {
  it('uses the teacher override active at the lesson local start', () => {
    const override = { ...basePolicy, id: 'teacher-v2', scope: 'teacher' as const, teacherId: 'teacher-1', hourlyAmount: 150, effectiveFrom: '2026-09-15T00:00:00.000Z' }
    expect(resolveCompensationPolicy([basePolicy, override], 'teacher-1', lesson().startAt, 'Asia/Jerusalem')?.id).toBe('teacher-v2')
  })

  it('keeps an earlier lesson on the earlier policy version', () => {
    const later = { ...basePolicy, id: 'org-v2', hourlyAmount: 200, effectiveFrom: '2026-09-16T00:00:00.000Z' }
    expect(resolveCompensationPolicy([basePolicy, later], 'teacher-1', lesson().startAt, 'Asia/Jerusalem')?.id).toBe(basePolicy.id)
  })
})

describe('calculateTeacherEconomics', () => {
  it('calculates hourly compensation and contribution without cash data', () => {
    const result = calculateTeacherEconomics([lesson()], [basePolicy], 'Asia/Jerusalem')
    expect(result).toMatchObject({ deliveryCount: 1, deliveryHours: 1.5, attributedRevenue: 300, estimatedCompensation: 150, contribution: 150 })
  })

  it('supports fixed, percentage, and group participant models', () => {
    const fixed = { ...basePolicy, id: 'fixed', model: 'fixed_per_lesson' as const, hourlyAmount: null, fixedAmount: 80 }
    const percentage = { ...basePolicy, id: 'percent', model: 'percentage_revenue' as const, hourlyAmount: null, revenuePercent: 20 }
    const group = { ...basePolicy, id: 'group', model: 'base_plus_participant' as const, hourlyAmount: null, fixedAmount: 50, baseRateType: 'fixed_per_lesson' as const, participantAmount: 15 }
    expect(calculateTeacherEconomics([lesson()], [fixed], 'Asia/Jerusalem').estimatedCompensation).toBe(80)
    expect(calculateTeacherEconomics([lesson()], [percentage], 'Asia/Jerusalem').estimatedCompensation).toBe(60)
    expect(calculateTeacherEconomics([lesson({ enrolledStudentCount: 3 })], [group], 'Asia/Jerusalem').estimatedCompensation).toBe(80)
  })

  it('applies no-show and late parent cancellation policy, but teacher cancellation is zero', () => {
    const noShow = calculateTeacherEconomics([lesson({ status: 'no_show', deliveryConfirmedAt: null, deliveryConfirmationSource: null })], [basePolicy], 'Asia/Jerusalem')
    const late = calculateTeacherEconomics([lesson({ status: 'cancelled', cancellationActor: 'parent', lateParentCancellation: true, deliveryConfirmedAt: null })], [basePolicy], 'Asia/Jerusalem')
    const teacherCancel = calculateTeacherEconomics([lesson({ status: 'cancelled', cancellationActor: 'teacher', lateParentCancellation: true, deliveryConfirmedAt: null })], [basePolicy], 'Asia/Jerusalem')
    expect(noShow.estimatedCompensation).toBe(75)
    expect(late.estimatedCompensation).toBe(37.5)
    expect(teacherCancel.estimatedCompensation).toBe(0)
  })

  it('marks required confirmation, unknown legacy provenance, and missing policy', () => {
    const requiring = { ...basePolicy, requiresConfirmation: true }
    expect(calculateTeacherEconomics([lesson({ deliveryConfirmedAt: null })], [requiring], 'Asia/Jerusalem').confirmationState).toBe('estimated')
    expect(calculateTeacherEconomics([lesson({ deliveryConfirmedAt: null })], [basePolicy], 'Asia/Jerusalem').confirmationState).toBe('estimated')
    const missing = calculateTeacherEconomics([lesson()], [], 'Asia/Jerusalem')
    expect(missing.confirmationState).toBe('missing_policy')
    expect(missing.missingPolicyWarnings).toEqual(['lesson-1'])
  })

  it('excludes scheduled lessons and rounds money to cents', () => {
    const result = calculateTeacherEconomics([lesson({ status: 'scheduled', attributedRevenue: 999 }), lesson({ id: 'lesson-2', attributedRevenue: 100.005 })], [basePolicy], 'Asia/Jerusalem')
    expect(result.deliveryCount).toBe(1)
    expect(result.attributedRevenue).toBe(100.01)
    expect(result.estimatedCompensation).toBe(150)
  })
})
