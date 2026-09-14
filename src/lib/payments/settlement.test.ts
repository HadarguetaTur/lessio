import { describe, expect, it } from 'vitest'
import {
  allocateProviderPayment,
  chargeOutstanding,
  isMissingIdempotencyKey,
} from './settlement'

describe('allocateProviderPayment', () => {
  it('settles the remaining balance after a partial cash payment', () => {
    // ₪200 charge, ₪50 cash recorded, the link was minted for ₪150.
    const { allocations, surplus, shortfall } = allocateProviderPayment(
      [{ id: 'c1', outstanding: 150 }],
      150
    )

    expect(allocations).toEqual([{ chargeId: 'c1', amount: 150 }])
    expect(surplus).toBe(0)
    expect(shortfall).toBe(0)
  })

  it('never records more than a charge still owes', () => {
    // Gross ₪200 link went out, then ₪100 cash was recorded, then the parent
    // paid the full ₪200 link: ₪300 arrived against a ₪200 debt.
    const { allocations, surplus } = allocateProviderPayment(
      [{ id: 'c1', outstanding: 100 }],
      200
    )

    expect(allocations).toEqual([{ chargeId: 'c1', amount: 100 }])
    expect(surplus).toBe(100)
  })

  it('spreads a consolidated payment across the charges it covered', () => {
    const { allocations, surplus } = allocateProviderPayment(
      [
        { id: 'c1', outstanding: 120 },
        { id: 'c2', outstanding: 80 },
      ],
      200
    )

    expect(allocations).toEqual([
      { chargeId: 'c1', amount: 120 },
      { chargeId: 'c2', amount: 80 },
    ])
    expect(surplus).toBe(0)
  })

  it('stops at what actually arrived when the group grew after the link went out', () => {
    const { allocations, shortfall } = allocateProviderPayment(
      [
        { id: 'c1', outstanding: 120 },
        { id: 'c2', outstanding: 80 },
      ],
      150
    )

    expect(allocations).toEqual([
      { chargeId: 'c1', amount: 120 },
      { chargeId: 'c2', amount: 30 },
    ])
    expect(shortfall).toBe(50)
  })

  it('allocates nothing when every charge is already settled', () => {
    const { allocations, surplus } = allocateProviderPayment(
      [{ id: 'c1', outstanding: 0 }],
      150
    )

    expect(allocations).toEqual([])
    expect(surplus).toBe(150)
  })

  it('keeps agorot exact', () => {
    const { allocations, surplus } = allocateProviderPayment(
      [
        { id: 'c1', outstanding: 33.33 },
        { id: 'c2', outstanding: 33.34 },
      ],
      66.67
    )

    expect(allocations).toEqual([
      { chargeId: 'c1', amount: 33.33 },
      { chargeId: 'c2', amount: 33.34 },
    ])
    expect(surplus).toBe(0)
  })
})

describe('chargeOutstanding', () => {
  it('is the balance, not the billed total', () => {
    expect(chargeOutstanding({ amount: 200, amount_paid: 50 })).toBe(150)
  })

  it('never goes negative', () => {
    expect(chargeOutstanding({ amount: 200, amount_paid: 250 })).toBe(0)
  })
})

describe('isMissingIdempotencyKey', () => {
  it('recognises an environment without the unique index', () => {
    expect(
      isMissingIdempotencyKey({
        code: '42P10',
        message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
      })
    ).toBe(true)
  })

  it('recognises an environment without the column', () => {
    expect(
      isMissingIdempotencyKey({
        code: 'PGRST204',
        message: "Could not find the 'provider_reference' column of 'charge_payments'",
      })
    ).toBe(true)
  })

  it('does not confuse an ordinary write failure with a schema gap', () => {
    expect(isMissingIdempotencyKey({ code: '23505', message: 'duplicate key value' })).toBe(false)
    expect(isMissingIdempotencyKey(null)).toBe(false)
  })
})
