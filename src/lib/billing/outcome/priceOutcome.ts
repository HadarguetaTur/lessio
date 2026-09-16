/**
 * What one student's part of a delivered lesson should leave behind
 * (decision #46). Pure: the reconciler asks the database which packs exist and
 * feeds the answer in here.
 *
 * Precedence is subscription → pack → money, for a present and an absent
 * student alike. A student discount is already inside `baseAmount`; it never
 * touches a pack price.
 */

import type { PackAction } from '@/lib/cancellation-policy/collection'

export type PackConsumeKind = 'consume_lesson' | 'consume_late_cancel' | 'consume_no_show'

export type OutcomeDecision =
  | { record: 'none'; amount: 0; reason: 'subscription' | 'free_policy' | 'missing_rate' }
  | { record: 'pack'; kind: 'consume_lesson' | 'consume_no_show' }
  | { record: 'charge'; chargeType: 'lesson' | 'no_show'; amount: number }

export interface OutcomeInput {
  absent: boolean
  coveredBySubscription: boolean
  /** An eligible pack with credit exists, or this student's use is already punched. */
  packAvailable: boolean
  /** Per-student list price after the student's own rate/discount. Null = cannot be priced. */
  baseAmount: number | null
  noShowChargePercent: number
  noShowPackAction: PackAction
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function priceOutcome(input: OutcomeInput): OutcomeDecision {
  if (input.coveredBySubscription) return { record: 'none', amount: 0, reason: 'subscription' }

  if (!input.absent) {
    if (input.packAvailable) return { record: 'pack', kind: 'consume_lesson' }
    if (input.baseAmount == null) return { record: 'none', amount: 0, reason: 'missing_rate' }
    return { record: 'charge', chargeType: 'lesson', amount: round2(input.baseAmount) }
  }

  if (input.packAvailable && input.noShowPackAction === 'consume') {
    return { record: 'pack', kind: 'consume_no_show' }
  }
  const percent = Math.min(100, Math.max(0, input.noShowChargePercent))
  if (percent === 0) return { record: 'none', amount: 0, reason: 'free_policy' }
  if (input.baseAmount == null) return { record: 'none', amount: 0, reason: 'missing_rate' }
  const amount = round2((input.baseAmount * percent) / 100)
  if (amount <= 0) return { record: 'none', amount: 0, reason: 'free_policy' }
  return { record: 'charge', chargeType: 'no_show', amount }
}

/**
 * Does a late cancellation try to burn a punch instead of charging a fee?
 * Only when the policy would charge something at all — a free early cancel
 * never touches a pack. A partial-window fee still burns a whole punch.
 */
export function lateCancelWantsPack(
  charge: { shouldCharge: boolean; amount: number },
  action: PackAction
): boolean {
  return action === 'consume' && charge.shouldCharge && charge.amount > 0
}
