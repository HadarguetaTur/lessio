/**
 * The collection half of the org's policy: what a no-show costs and how punch
 * cards behave. Stored on `cancellation_policies` next to the cancellation
 * windows (decision #46: one policy, one settings page).
 *
 * Pure — safe to import from tests and client components. Every default is the
 * behaviour an org had before these settings existed: a no-show is free, a pack
 * activates as soon as it is sold and belongs to one student.
 */

export type PackAction = 'consume' | 'charge'
export type PackActivation = 'immediate' | 'on_payment'
export type PackScope = 'student' | 'family'

export interface CollectionPolicy {
  noShowChargePercent: number
  noShowPackAction: PackAction
  lateCancelPackAction: PackAction
  packActivation: PackActivation
  packScope: PackScope
  packLowBalanceThreshold: number
  packNotificationsEnabled: boolean
  /**
   * The org chose to collect through punch cards. Only then does a portal
   * booking with no entitlement require payment first — and only in a
   * per-lesson org.
   */
  packCollectionEnabled: boolean
}

export const DEFAULT_COLLECTION_POLICY: CollectionPolicy = {
  noShowChargePercent: 0,
  noShowPackAction: 'consume',
  lateCancelPackAction: 'consume',
  packActivation: 'immediate',
  packScope: 'student',
  packLowBalanceThreshold: 2,
  packNotificationsEnabled: false,
  packCollectionEnabled: false,
}

/** The row columns this module reads. */
export interface CollectionPolicyRow {
  no_show_charge_percent?: number | null
  no_show_pack_action?: string | null
  late_cancel_pack_action?: string | null
  pack_activation?: string | null
  pack_scope?: string | null
  pack_low_balance_threshold?: number | null
  pack_notifications_enabled?: boolean | null
  pack_collection_enabled?: boolean | null
}

export const COLLECTION_POLICY_COLUMNS =
  'no_show_charge_percent, no_show_pack_action, late_cancel_pack_action, pack_activation, pack_scope, pack_low_balance_threshold, pack_notifications_enabled, pack_collection_enabled'

function packAction(value: string | null | undefined, fallback: PackAction): PackAction {
  return value === 'consume' || value === 'charge' ? value : fallback
}

/** A missing row, or a row written before these columns existed, reads as the defaults. */
export function toCollectionPolicy(row: CollectionPolicyRow | null | undefined): CollectionPolicy {
  const d = DEFAULT_COLLECTION_POLICY
  if (!row) return d
  const percent = Number(row.no_show_charge_percent)
  const threshold = Number(row.pack_low_balance_threshold)
  return {
    noShowChargePercent:
      row.no_show_charge_percent != null && Number.isFinite(percent)
        ? Math.min(100, Math.max(0, percent))
        : d.noShowChargePercent,
    noShowPackAction: packAction(row.no_show_pack_action, d.noShowPackAction),
    lateCancelPackAction: packAction(row.late_cancel_pack_action, d.lateCancelPackAction),
    packActivation: row.pack_activation === 'on_payment' ? 'on_payment' : 'immediate',
    packScope: row.pack_scope === 'family' ? 'family' : 'student',
    packLowBalanceThreshold:
      row.pack_low_balance_threshold != null && Number.isFinite(threshold) && threshold >= 0
        ? threshold
        : d.packLowBalanceThreshold,
    packNotificationsEnabled: row.pack_notifications_enabled === true,
    packCollectionEnabled: row.pack_collection_enabled === true,
  }
}
