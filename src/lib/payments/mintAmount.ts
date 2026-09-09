import { sumRemaining } from '@/lib/charges'

/**
 * The single place that decides how much a payment link is minted to collect.
 *
 * There are four mint paths (the monthly-bill send, the auto-send after a
 * lesson, the consolidated parent request and the parents-page request) and
 * they used to compute this figure independently. The monthly path selected
 * `amount` without `amount_paid` and minted GROSS, while the
 * `charge_payment_references` trigger records `GREATEST(amount - amount_paid, 0)`
 * — NET. A ₪800 charge with ₪300 already recorded as cash minted an ₪800 link
 * against ₪500 of history, so the webhook either rejected the genuine payment
 * outright (stripe/payplus compare the collected amount to the minted one) or
 * allocated ₪500 and discarded the ₪300 surplus to a log line
 * (cardcom/grow/bit/paybox).
 *
 * Every mint path must call this. Keeping the derivation in one function is
 * what stops a fifth path diverging again.
 */
export function mintAmountForCharges(
  rows: Array<{ amount: number | string; amount_paid?: number | string | null }>
): number {
  return sumRemaining(rows)
}

/** Thrown when a link would be minted for nothing — the charge is already settled. */
export class NothingToCollectError extends Error {
  constructor(message = 'Nothing left to collect on these charges') {
    super(message)
    this.name = 'NothingToCollectError'
  }
}

/**
 * `mintAmountForCharges` plus the guard every caller needs: a link minted for
 * ≤ 0 is a link the provider cannot take money through and the trigger would
 * record as zero outstanding.
 */
export function requireMintAmount(
  rows: Array<{ amount: number | string; amount_paid?: number | string | null }>
): number {
  const amount = mintAmountForCharges(rows)
  if (!(amount > 0)) throw new NothingToCollectError()
  return amount
}
