/**
 * The rules that decide whether a Sumit payment may activate a subscription.
 *
 * Each case here is an attack or an accident that would otherwise hand out a
 * paid plan: a replayed payment id, an id from before the checkout started,
 * another Sumit customer's payment, or an underpayment. The redirect query is
 * attacker-controlled (it is a URL the customer can edit), so every rule is
 * stated against what Sumit itself reports about the payment.
 */

import { describe, expect, it } from 'vitest'
import {
  AMOUNT_TOLERANCE,
  PAYMENT_DATE_SKEW_MS,
  evaluateCheckoutBinding,
  type CheckoutBindingInput,
} from './checkoutBinding'
import type { SumitPayment } from './sumitParse'

const NOW = new Date('2026-09-02T12:00:00Z')
const STARTED_AT = '2026-09-02T11:30:00Z'
const REFERENCE = 'ref-uuid-1'

function payment(over: Partial<SumitPayment> = {}): SumitPayment {
  return {
    id: '90210',
    customerId: '555',
    date: '2026-09-02T11:45:00Z',
    valid: true,
    status: '000',
    statusDescription: 'Approved',
    amount: 149,
    token: 'tok_abc',
    last4: '4242',
    expiryMonth: 11,
    expiryYear: 2029,
    authNumber: '1',
    ...over,
  }
}

function input(over: Partial<CheckoutBindingInput> = {}): CheckoutBindingInput {
  return {
    payment: payment(),
    urlExternalIdentifier: REFERENCE,
    urlCustomerId: null,
    sub: {
      status: 'pending_payment',
      pendingCheckoutReference: REFERENCE,
      pendingCheckoutStartedAt: STARTED_AT,
      sumitCustomerId: null,
      expectedAmount: 149,
    },
    paymentIdAlreadyRecorded: false,
    now: NOW,
    ...over,
  }
}

describe('evaluateCheckoutBinding', () => {
  it('accepts the ordinary case: a fresh valid payment for this checkout', () => {
    expect(evaluateCheckoutBinding(input())).toEqual({ ok: true })
  })

  it('refuses a payment Sumit marks invalid', () => {
    expect(evaluateCheckoutBinding(input({ payment: payment({ valid: false }) }))).toEqual({
      ok: false,
      reason: 'payment_invalid',
    })
  })

  it('refuses a reference that is not the one we issued', () => {
    // Another org's checkout reference, or a guess.
    expect(evaluateCheckoutBinding(input({ urlExternalIdentifier: 'ref-uuid-2' }))).toEqual({
      ok: false,
      reason: 'reference_mismatch',
    })
  })

  it('refuses when no checkout is pending', () => {
    expect(
      evaluateCheckoutBinding(
        input({ sub: { ...input().sub, status: 'active', pendingCheckoutReference: null } })
      )
    ).toEqual({ ok: false, reason: 'reference_mismatch' })
  })

  it('refuses a payment id that already paid for something', () => {
    // The replay: start a new checkout, paste an old valid OG-PaymentID.
    expect(evaluateCheckoutBinding(input({ paymentIdAlreadyRecorded: true }))).toEqual({
      ok: false,
      reason: 'payment_replayed',
    })
  })

  it('refuses a payment made before this checkout began', () => {
    const before = new Date(Date.parse(STARTED_AT) - PAYMENT_DATE_SKEW_MS - 60_000).toISOString()
    expect(evaluateCheckoutBinding(input({ payment: payment({ date: before }) }))).toEqual({
      ok: false,
      reason: 'payment_predates_checkout',
    })
  })

  it('allows a payment inside the clock-skew window', () => {
    // Sumit does not document the offset on Payment.Date, so a few hours of
    // apparent backdating is normal rather than suspicious.
    const slightlyBefore = new Date(Date.parse(STARTED_AT) - PAYMENT_DATE_SKEW_MS + 60_000).toISOString()
    expect(evaluateCheckoutBinding(input({ payment: payment({ date: slightlyBefore }) }))).toEqual({
      ok: true,
    })
  })

  it('allows a payment with no date at all', () => {
    expect(evaluateCheckoutBinding(input({ payment: payment({ date: null }) }))).toEqual({ ok: true })
  })

  it('refuses a payment by a different Sumit customer than the org has', () => {
    expect(
      evaluateCheckoutBinding(input({ sub: { ...input().sub, sumitCustomerId: '999' } }))
    ).toEqual({ ok: false, reason: 'customer_mismatch' })
  })

  it('refuses when the URL names a customer the payment does not belong to', () => {
    expect(evaluateCheckoutBinding(input({ urlCustomerId: '999' }))).toEqual({
      ok: false,
      reason: 'customer_mismatch',
    })
  })

  it('accepts a returning customer paying with the id already on file', () => {
    expect(
      evaluateCheckoutBinding(input({ sub: { ...input().sub, sumitCustomerId: '555' } }))
    ).toEqual({ ok: true })
  })

  it('refuses an underpayment', () => {
    // A 1 shekel payment used to activate any plan.
    expect(evaluateCheckoutBinding(input({ payment: payment({ amount: 1 }) }))).toEqual({
      ok: false,
      reason: 'amount_below_plan_price',
    })
  })

  it('absorbs agorot rounding rather than calling it an underpayment', () => {
    expect(
      evaluateCheckoutBinding(input({ payment: payment({ amount: 149 - AMOUNT_TOLERANCE / 2 }) }))
    ).toEqual({ ok: true })
  })

  it('accepts an overpayment', () => {
    expect(evaluateCheckoutBinding(input({ payment: payment({ amount: 200 }) }))).toEqual({ ok: true })
  })

  it('checks validity before anything else', () => {
    // An invalid payment that is also replayed reports the plainer reason.
    expect(
      evaluateCheckoutBinding(
        input({ payment: payment({ valid: false }), paymentIdAlreadyRecorded: true })
      )
    ).toEqual({ ok: false, reason: 'payment_invalid' })
  })
})
