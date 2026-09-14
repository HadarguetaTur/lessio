import { describe, expect, it } from 'vitest'
import {
  mintAmountForCharges,
  requireMintAmount,
  NothingToCollectError,
} from './mintAmount'

/**
 * The figure a payment link is minted for must equal what the
 * `charge_payment_references` trigger records: GREATEST(amount - amount_paid, 0).
 *
 * The monthly-bill send path used to select `amount` without `amount_paid` and
 * mint GROSS. A ₪800 charge with ₪300 recorded as cash minted an ₪800 link
 * against ₪500 of history — stripe/payplus then rejected the genuine ₪800
 * payment, cardcom/grow/bit/paybox allocated ₪500 and logged the ₪300 away.
 */
function triggerAmount(amount: number, amountPaid: number): number {
  return Math.max(amount - amountPaid, 0)
}

describe('mintAmountForCharges', () => {
  it('matches the trigger on a partially-paid charge', () => {
    expect(mintAmountForCharges([{ amount: 800, amount_paid: 300 }])).toBe(500)
    expect(mintAmountForCharges([{ amount: 800, amount_paid: 300 }])).toBe(triggerAmount(800, 300))
  })

  it('is gross when nothing has been paid', () => {
    expect(mintAmountForCharges([{ amount: 800, amount_paid: 0 }])).toBe(800)
    expect(mintAmountForCharges([{ amount: 800 }])).toBe(800)
  })

  it('treats a null amount_paid as zero and never goes negative', () => {
    expect(mintAmountForCharges([{ amount: 200, amount_paid: null }])).toBe(200)
    expect(mintAmountForCharges([{ amount: 200, amount_paid: 250 }])).toBe(0)
  })

  it('accepts the numeric-as-string rows PostgREST returns', () => {
    expect(mintAmountForCharges([{ amount: '800.00', amount_paid: '300.00' }])).toBe(500)
  })

  it('sums a multi-charge link net of each charge s partial payments', () => {
    expect(
      mintAmountForCharges([
        { amount: 100, amount_paid: 0 },
        { amount: 100, amount_paid: 40 },
      ])
    ).toBe(160)
  })
})

describe('requireMintAmount', () => {
  it('refuses to mint a link for a fully-paid charge', () => {
    expect(() => requireMintAmount([{ amount: 800, amount_paid: 800 }])).toThrow(
      NothingToCollectError
    )
  })

  it('returns the net amount when there is something to collect', () => {
    expect(requireMintAmount([{ amount: 800, amount_paid: 300 }])).toBe(500)
  })
})
