import { describe, expect, it } from 'vitest'
import { DEFAULT_COLLECTION_POLICY, toCollectionPolicy } from './collection'

describe('toCollectionPolicy', () => {
  it('reads a missing row as the behaviour before these settings existed', () => {
    expect(toCollectionPolicy(null)).toEqual(DEFAULT_COLLECTION_POLICY)
    expect(toCollectionPolicy({})).toEqual(DEFAULT_COLLECTION_POLICY)
    expect(DEFAULT_COLLECTION_POLICY.noShowChargePercent).toBe(0)
  })

  it('maps a full row and clamps junk', () => {
    expect(
      toCollectionPolicy({
        no_show_charge_percent: 140,
        no_show_pack_action: 'charge',
        late_cancel_pack_action: 'bogus',
        pack_activation: 'on_payment',
        pack_scope: 'family',
        pack_low_balance_threshold: 3,
        pack_notifications_enabled: true,
        pack_collection_enabled: true,
      })
    ).toEqual({
      packCollectionEnabled: true,
      noShowChargePercent: 100,
      noShowPackAction: 'charge',
      lateCancelPackAction: 'consume',
      packActivation: 'on_payment',
      packScope: 'family',
      packLowBalanceThreshold: 3,
      packNotificationsEnabled: true,
    })
  })
})
