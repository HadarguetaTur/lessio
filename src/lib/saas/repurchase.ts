/**
 * Is this org buying its way back in, rather than climbing a ladder?
 *
 * `evaluateUpgrade` refuses a target whose sort_order is not above the current
 * plan's. That is right for a live subscription and wrong for a lapsed one: an
 * org whose card failed, whose trial ended, or that cancelled has no live plan
 * — and the plan it most likely wants is the one it just lost. Treating those
 * states as "no current plan" is what makes the recovery link in a dunning
 * email lead somewhere that works.
 *
 * Shared by the billing page (which plans to offer) and the checkout action
 * (which plans to accept), so the two cannot drift.
 */

import { isTrialExpired, type OrgSubscriptionState } from './subscriptions'

export function isRepurchase(state: OrgSubscriptionState): boolean {
  return (
    state.status === 'pending_payment' ||
    state.status === 'past_due' ||
    state.status === 'cancelled' ||
    state.status === 'read_only' ||
    isTrialExpired(state)
  )
}
