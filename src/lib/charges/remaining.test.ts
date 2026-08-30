import { describe, expect, it } from 'vitest'
import { getChargeRemaining } from './index'

describe('getChargeRemaining', () => {
  it('returns the unpaid remainder for partially paid charges', () => {
    expect(getChargeRemaining(1800, 250)).toBe(1550)
  })

  it('never returns a negative balance', () => {
    expect(getChargeRemaining(500, 800)).toBe(0)
  })

  it('matches the full amount when nothing has been paid', () => {
    expect(getChargeRemaining(1200, 0)).toBe(1200)
  })
})
