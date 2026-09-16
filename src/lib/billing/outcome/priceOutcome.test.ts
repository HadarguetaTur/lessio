import { describe, expect, it } from 'vitest'
import { lateCancelWantsPack, priceOutcome, type OutcomeInput } from './priceOutcome'

const base: OutcomeInput = {
  absent: false,
  coveredBySubscription: false,
  packAvailable: false,
  baseAmount: 200,
  noShowChargePercent: 50,
  noShowPackAction: 'consume',
}

describe('priceOutcome', () => {
  it.each([false, true])('a subscription covers the lesson whether or not the student came (absent=%s)', (absent) => {
    expect(priceOutcome({ ...base, absent, coveredBySubscription: true, packAvailable: true })).toEqual({
      record: 'none', amount: 0, reason: 'subscription',
    })
  })

  it('present with a pack burns a lesson punch', () => {
    expect(priceOutcome({ ...base, packAvailable: true })).toEqual({ record: 'pack', kind: 'consume_lesson' })
  })

  it('present without a pack charges the list price', () => {
    expect(priceOutcome(base)).toEqual({ record: 'charge', chargeType: 'lesson', amount: 200 })
  })

  it('present and unpriceable is an alert, not a zero charge', () => {
    expect(priceOutcome({ ...base, baseAmount: null })).toEqual({ record: 'none', amount: 0, reason: 'missing_rate' })
  })

  it.each([
    ['consume', true, { record: 'pack', kind: 'consume_no_show' }],
    ['charge', true, { record: 'charge', chargeType: 'no_show', amount: 100 }],
    ['consume', false, { record: 'charge', chargeType: 'no_show', amount: 100 }],
    ['charge', false, { record: 'charge', chargeType: 'no_show', amount: 100 }],
  ] as const)('absent, pack action %s, pack available %s', (action, packAvailable, expected) => {
    expect(priceOutcome({ ...base, absent: true, packAvailable, noShowPackAction: action })).toEqual(expected)
  })

  it.each([
    [0, { record: 'none', amount: 0, reason: 'free_policy' }],
    [50, { record: 'charge', chargeType: 'no_show', amount: 100 }],
    [100, { record: 'charge', chargeType: 'no_show', amount: 200 }],
  ] as const)('absent without a pack at %s percent', (percent, expected) => {
    expect(priceOutcome({ ...base, absent: true, noShowChargePercent: percent })).toEqual(expected)
  })

  it('a free no-show policy never needs a price', () => {
    expect(priceOutcome({ ...base, absent: true, noShowChargePercent: 0, baseAmount: null })).toEqual({
      record: 'none', amount: 0, reason: 'free_policy',
    })
  })

  it('rounds the no-show fee to agorot', () => {
    expect(priceOutcome({ ...base, absent: true, baseAmount: 112.5, noShowChargePercent: 33 })).toEqual({
      record: 'charge', chargeType: 'no_show', amount: 37.13,
    })
  })
})

describe('lateCancelWantsPack', () => {
  it('burns a punch only when the policy charges and the org says consume', () => {
    expect(lateCancelWantsPack({ shouldCharge: true, amount: 100 }, 'consume')).toBe(true)
    expect(lateCancelWantsPack({ shouldCharge: true, amount: 100 }, 'charge')).toBe(false)
    expect(lateCancelWantsPack({ shouldCharge: false, amount: 0 }, 'consume')).toBe(false)
  })
})
