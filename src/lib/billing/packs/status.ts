/**
 * A pack's status is derived, never stored (decision #46). Pure.
 *
 * Order matters: a cancelled pack is cancelled whatever else is true, an
 * unpaid pack cannot be exhausted, and an expired pack may still show credits
 * that can no longer be used.
 */

export type PackStatus = 'pending_payment' | 'active' | 'exhausted' | 'expired' | 'cancelled'

export interface PackStatusInput {
  cancelled_at: string | null
  activated_at: string | null
  valid_until: string | null
  remaining: number
}

/** `today` is YYYY-MM-DD in the org's timezone. */
export function packStatus(pack: PackStatusInput, today: string): PackStatus {
  if (pack.cancelled_at) return 'cancelled'
  if (!pack.activated_at) return 'pending_payment'
  if (pack.valid_until && pack.valid_until < today) return 'expired'
  if (pack.remaining <= 0) return 'exhausted'
  return 'active'
}

/** "Running low" — worth a badge on the list and, in M2, a message. */
export function isPackRunningLow(pack: PackStatusInput, today: string, threshold: number): boolean {
  return packStatus(pack, today) === 'active' && pack.remaining <= threshold
}
