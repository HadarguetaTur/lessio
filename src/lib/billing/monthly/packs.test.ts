import { describe, expect, it } from 'vitest'
import { calculatePacksContribution } from './packs'

describe('calculatePacksContribution', () => {
  it('bills only this month’s uncancelled sales that have no charge of their own', () => {
    expect(
      calculatePacksContribution(
        [
          { id: 'a', price: '900.00', sold_billing_month: '2026-09', cancelled_at: null, charge_id: null },
          { id: 'b', price: 450, sold_billing_month: '2026-09', cancelled_at: null, charge_id: null },
          { id: 'c', price: 900, sold_billing_month: '2026-08', cancelled_at: null, charge_id: null },
          { id: 'd', price: 900, sold_billing_month: '2026-09', cancelled_at: '2026-09-02T10:00:00Z', charge_id: null },
          { id: 'e', price: 900, sold_billing_month: '2026-09', cancelled_at: null, charge_id: 'charge-1' },
        ],
        '2026-09'
      )
    ).toEqual({ packsTotal: 1350, packsCount: 2 })
  })
})
