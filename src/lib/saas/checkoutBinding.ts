/**
 * Does this Sumit payment pay for that pending checkout?
 *
 * Pure rules, no I/O, so every refusal has a test. The inputs are the payment
 * as Sumit reports it (never the redirect query — that is only a hint about
 * which payment to look up), the org's pending subscription row, and whether
 * the payment id has already paid for something.
 *
 * Why each rule exists:
 *   - reference: the query's OG-ExternalIdentifier must equal the reference we
 *     stored for this org. Another org's checkout cannot activate ours.
 *   - replay: a payment id activates exactly one period. Without this, anyone
 *     holding the id of a valid past payment could start a fresh checkout,
 *     paste that id into the callback URL and activate without paying.
 *   - date: the same attack with an id from before the checkout started.
 *     Sumit's Payment.Date has no documented offset, so the comparison allows
 *     PAYMENT_DATE_SKEW_MS of slack; a missing date is not held against it.
 *   - customer: an org that already has a Sumit customer id must be paid by
 *     that customer. The URL's OG-CustomerID, if present, must agree too.
 *   - amount: the confirmed amount covers the plan price for the stored
 *     interval, within rounding.
 */

import type { SumitPayment } from './sumitParse'

export type CheckoutBindingRefusal =
  | 'payment_invalid'
  | 'reference_mismatch'
  | 'payment_replayed'
  | 'payment_predates_checkout'
  | 'customer_mismatch'
  | 'amount_below_plan_price'

export interface CheckoutBindingSubscription {
  status: string
  pendingCheckoutReference: string | null
  pendingCheckoutStartedAt: string | null
  sumitCustomerId: string | null
  /** Plan price for the stored billing interval, VAT included. */
  expectedAmount: number
}

export interface CheckoutBindingInput {
  payment: SumitPayment
  urlExternalIdentifier: string | null
  urlCustomerId: string | null
  sub: CheckoutBindingSubscription
  paymentIdAlreadyRecorded: boolean
  now: Date
}

export type CheckoutBindingVerdict = { ok: true } | { ok: false; reason: CheckoutBindingRefusal }

/** Slack for Sumit's undocumented Date offset (Israel is UTC+2/+3). */
export const PAYMENT_DATE_SKEW_MS = 4 * 3_600_000

/** Underpayment guard tolerance — absorbs VAT/agorot rounding, not a cheaper plan. */
export const AMOUNT_TOLERANCE = 0.02

function parseDate(v: string | null): number | null {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

export function evaluateCheckoutBinding(i: CheckoutBindingInput): CheckoutBindingVerdict {
  if (!i.payment.valid) return { ok: false, reason: 'payment_invalid' }

  if (
    i.sub.status !== 'pending_payment' ||
    !i.sub.pendingCheckoutReference ||
    i.urlExternalIdentifier !== i.sub.pendingCheckoutReference
  ) {
    return { ok: false, reason: 'reference_mismatch' }
  }

  if (i.paymentIdAlreadyRecorded) return { ok: false, reason: 'payment_replayed' }

  const startedAt = parseDate(i.sub.pendingCheckoutStartedAt)
  const paidAt = parseDate(i.payment.date)
  if (startedAt != null && paidAt != null && paidAt < startedAt - PAYMENT_DATE_SKEW_MS) {
    return { ok: false, reason: 'payment_predates_checkout' }
  }

  if (i.sub.sumitCustomerId && i.sub.sumitCustomerId !== i.payment.customerId) {
    return { ok: false, reason: 'customer_mismatch' }
  }
  if (i.urlCustomerId && i.urlCustomerId !== i.payment.customerId) {
    return { ok: false, reason: 'customer_mismatch' }
  }

  if (i.payment.amount + AMOUNT_TOLERANCE < i.sub.expectedAmount) {
    return { ok: false, reason: 'amount_below_plan_price' }
  }

  return { ok: true }
}
