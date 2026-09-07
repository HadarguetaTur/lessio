/**
 * The prospect state machine, as one pure table.
 *
 * `nextStatus` answers "a reply classified X arrived for a prospect in state
 * Y — what is the new state?", and returns null when nothing should move.
 * Everything that writes `outbound_prospects.status` on an inbound message
 * goes through here, so the dashboard's badge and the ingest path can never
 * disagree about what a state means.
 */

import type { ProspectStatus, ReplyClassification } from './types'

/** States in which an inbound message is logged but never moves the prospect. */
export const INBOUND_TERMINAL: readonly ProspectStatus[] = ['unsubscribed', 'bounced', 'converted']

/** States from which a first real reply may move the prospect. */
const REPLYABLE: readonly ProspectStatus[] = ['claimed', 'sent', 'replied', 'failed']

export function nextStatus(
  current: ProspectStatus,
  classification: ReplyClassification
): ProspectStatus | null {
  if (INBOUND_TERMINAL.includes(current)) return null
  if (classification === 'auto_reply') return null

  // A bounce is a fact about the address, whatever the conversation state.
  if (classification === 'bounce') return 'bounced'

  // Someone who already answered may still ask out.
  if (classification === 'unsubscribe') {
    return REPLYABLE.includes(current) || current === 'interested' || current === 'not_interested'
      ? 'unsubscribed'
      : null
  }

  if (!REPLYABLE.includes(current)) return null

  switch (classification) {
    case 'interested':
      return 'interested'
    case 'not_interested':
      return 'not_interested'
    case 'unknown':
      // A human reads it on the dashboard. `replied` stays re-enterable so a
      // later "yes" still lands.
      return current === 'replied' ? null : 'replied'
  }
}
