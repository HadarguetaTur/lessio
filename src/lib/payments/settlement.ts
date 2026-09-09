/**
 * Turning one provider payment into charge_payments rows.
 *
 * Everything here is about the four ways a provider callback and our ledger can
 * disagree, and they are all money:
 *
 *  1. The link was minted for what the parent still owed (net of a cash payment
 *     recorded in the meantime), so validating the callback against the gross
 *     charge total rejects every legitimate payment on a partially-paid charge.
 *     `mintedAmount` is what we asked for, and it is what we check.
 *  2. A charge can carry several references over its life (every resend mints a
 *     new one). Resolution goes through charge_payment_references so an older
 *     link stays payable — see the migration for why that table exists.
 *  3. What arrives may be more than what is still open (owner recorded cash
 *     after the link went out). We record what each charge can absorb and
 *     report the surplus loudly instead of writing a payment larger than the
 *     debt.
 *  4. amount_paid must equal the sum of charge_payments, not a number we add to
 *     from two places. It is recomputed from that sum after every write, so a
 *     duplicate, late or out-of-order callback converges on the same figure.
 */

import { round2 } from '@/lib/charges/paymentMethods'

export interface ReferenceCharge {
  id: string
  organization_id: string
  status: string
  amount: number
  amount_paid: number
  parent_id: string | null
}

/** Charges settleable right now — anything else is terminal and left alone. */
export const SETTLEABLE_STATUSES: ReadonlySet<string> = new Set(['pending', 'invoiced'])

export function chargeOutstanding(charge: Pick<ReferenceCharge, 'amount' | 'amount_paid'>): number {
  return Math.max(0, round2(Number(charge.amount) - Number(charge.amount_paid ?? 0)))
}

export interface Allocation {
  chargeId: string
  amount: number
}

/**
 * Spreads one provider payment across the charges its link covered.
 *
 * In order, oldest first: each charge absorbs at most what it still owes, and
 * the payment is never stretched past what actually arrived. Whatever is left
 * over is a genuine overpayment — the caller surfaces it rather than inventing
 * a charge_payments row bigger than the debt it settles.
 */
export function allocateProviderPayment(
  charges: Array<{ id: string; outstanding: number }>,
  collected: number
): { allocations: Allocation[]; surplus: number; shortfall: number } {
  let left = round2(Math.max(0, collected))
  const totalOutstanding = round2(charges.reduce((sum, c) => sum + Math.max(0, c.outstanding), 0))
  const allocations: Allocation[] = []

  for (const charge of charges) {
    if (left <= 0) break
    const share = round2(Math.min(Math.max(0, charge.outstanding), left))
    if (share <= 0) continue
    allocations.push({ chargeId: charge.id, amount: share })
    left = round2(left - share)
  }

  return {
    allocations,
    surplus: left,
    shortfall: round2(Math.max(0, totalOutstanding - round2(Math.max(0, collected)))),
  }
}

/**
 * True when a Postgres error says the idempotency key is not there — the unique
 * index on (charge_id, provider_reference) that the upsert's ON CONFLICT names.
 *
 * 42P10 is what Postgres raises for an ON CONFLICT target with no matching
 * constraint, 42703 for the column itself missing. Both mean the environment is
 * behind on migrations, and both must stop the settlement loudly: continuing
 * would mark a charge paid whose payment row was never written, or write the
 * same payment twice on a redelivery.
 */
export function isMissingIdempotencyKey(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P10' || error.code === '42703' || error.code === 'PGRST204') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('provider_reference') &&
    (message.includes('does not exist') ||
      message.includes('no unique or exclusion constraint') ||
      message.includes('could not find'))
  )
}
