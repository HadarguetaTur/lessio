/**
 * The consent rule — one function, no I/O, no database.
 *
 * There used to be two copies of this policy: one in `applyConsent`, which runs
 * when a campaign materialises its recipients, and one in `prepareBusinessSend`,
 * which runs immediately before each message leaves. The two disagreed about
 * categories, and the gap between them is measured in days — a campaign drains
 * over many cron ticks and can pause overnight under the daily budget. A parent
 * who tapped "stop offers" on Monday kept getting Monday's campaign on Tuesday,
 * which is exactly what Meta punishes with error 131050.
 *
 * So the rule lives here, alone, and both callers ask it. Materialisation uses
 * it to preview and to explain; the send path uses it as the authority. They
 * cannot drift because there is nothing left to drift from.
 */

/**
 * What a message is measured against.
 *
 * `transactional` is everything the parent is already owed — a lesson reminder,
 * a payment request, a receipt. Only the global opt-out stops those; leaving the
 * offers list must never cost a parent tomorrow's lesson time.
 */
export type ConsentCategory = 'transactional' | 'update' | 'promo' | 'invite'

/** The parent's consent columns, as stored. Nulls mean "never said". */
export interface ConsentFacts {
  optedOutAt: string | null
  updatesOptedOutAt: string | null
  marketingOptInAt: string | null
  marketingOptedOutAt: string | null
}

/** Why a message is refused. Each value is also a `SkipReason`. */
export type ConsentRefusal =
  | 'opted_out'
  | 'updates_opted_out'
  | 'marketing_opted_out'
  | 'no_marketing_opt_in'

/** A phone with no parent row behind it — a student's own number, a teacher. */
export const NO_CONSENT_RECORD: ConsentFacts = {
  optedOutAt: null,
  updatesOptedOutAt: null,
  marketingOptInAt: null,
  marketingOptedOutAt: null,
}

/**
 * Why this category may not be sent to this person, or null when it may.
 *
 * Order is the policy itself:
 *   1. `optedOutAt` — the hard block, every category
 *   2. the category's own opt-out
 *   3. for marketing, an explicit opt-in is REQUIRED, not merely un-refused
 */
export function consentRefusal(
  facts: ConsentFacts,
  category: ConsentCategory
): ConsentRefusal | null {
  if (facts.optedOutAt) return 'opted_out'
  if (category === 'transactional') return null

  if (category === 'promo') {
    if (facts.marketingOptedOutAt) return 'marketing_opted_out'
    if (!facts.marketingOptInAt) return 'no_marketing_opt_in'
    return null
  }

  // 'update' and 'invite' are both service messages, refused by the same tap.
  if (facts.updatesOptedOutAt) return 'updates_opted_out'
  return null
}
