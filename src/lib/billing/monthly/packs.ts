import type { PacksContribution } from './types'
import { round2 } from './types'

/**
 * A pack sale in a monthly org (decision #46).
 *
 * `charge_id IS NULL` is what marks it as billed through the monthly engine —
 * a per-lesson org's sale has its own charge and never reaches here.
 */
export interface PackSaleRow {
  id: string
  price: number | string
  sold_billing_month: string
  cancelled_at: string | null
  charge_id: string | null
}

/** Pack sales that belong on this month's bill. Pure. */
export function calculatePacksContribution(packs: readonly PackSaleRow[], billingMonth: string): PacksContribution {
  let packsTotal = 0
  let packsCount = 0
  for (const pack of packs) {
    if (pack.sold_billing_month !== billingMonth) continue
    if (pack.cancelled_at || pack.charge_id) continue
    packsTotal += Number(pack.price)
    packsCount++
  }
  return { packsTotal: round2(packsTotal), packsCount }
}

export const PACK_SALE_COLUMNS = 'id, price, sold_billing_month, cancelled_at, charge_id, billing_student_id'
