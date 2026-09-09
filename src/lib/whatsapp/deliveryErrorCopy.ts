/**
 * What a failed WhatsApp delivery means, in words a staff member can act on.
 *
 * The thread used to render Meta's numeric code — "נכשל (131047)" — next to the
 * message bubble (UX audit F18). The number is precise and useless: nobody
 * reading an inbox knows that 131047 means the parent has not written in 24
 * hours, which is the one failure that is nobody's fault and needs no action.
 *
 * Only the codes that actually occur on Lessio's send paths are mapped.
 * Anything else falls back to a plain "failed" — inventing an explanation for
 * an unrecognised code would be worse than admitting we do not have one, and
 * the code is in the logs either way.
 */

/** Suffix under `waConversations.delivery.reasons`. */
export type DeliveryFailureReason =
  /** Outside the 24h customer-service window and no approved template. */
  | 'outside_window'
  /** The number is not on WhatsApp, or cannot receive from this business. */
  | 'undeliverable'
  /** Meta's per-user marketing cap for this recipient today. */
  | 'per_user_limit'
  /** The recipient asked this business to stop sending marketing. */
  | 'marketing_opted_out'
  /** Throughput — Meta was saturated. Worth retrying. */
  | 'rate_limited'

const CODE_REASONS: Record<number, DeliveryFailureReason> = {
  131047: 'outside_window',
  // Re-engagement message: the same situation as 131047 from a different path.
  470: 'outside_window',
  131026: 'undeliverable',
  131049: 'per_user_limit',
  131050: 'marketing_opted_out',
  130429: 'rate_limited',
  131056: 'rate_limited',
  80007: 'rate_limited',
}

/**
 * The reason a delivery failed, or null when the code is one we have no
 * customer-facing explanation for.
 */
export function deliveryFailureReason(
  code: number | string | null | undefined
): DeliveryFailureReason | null {
  if (code === null || code === undefined) return null
  const numeric = typeof code === 'number' ? code : Number.parseInt(code, 10)
  if (!Number.isFinite(numeric)) return null
  return CODE_REASONS[numeric] ?? null
}
