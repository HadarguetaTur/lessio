/**
 * Resolving a provider reference back to the charges it was minted for.
 *
 * `charges.payment_reference` holds only the newest link, so it answers "what
 * would a parent be paying if they opened WhatsApp right now" — not "whose
 * money is this". A parent paying a link from a week ago is not doing anything
 * wrong, and their payment has to land. charge_payment_references keeps every
 * reference a charge ever carried (written by a DB trigger, see
 * 20260909170000_charge_payment_reference_history.sql), and this resolves
 * through it, falling back to the live column so the lookup still works in an
 * environment where the table is not there yet.
 */

import { round2 } from '@/lib/charges/paymentMethods'
import type { ReferenceCharge } from './settlement'

const CHARGE_COLUMNS = 'id, organization_id, status, amount, amount_paid, parent_id'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface ResolvedReference {
  charges: ReferenceCharge[]
  /**
   * What this link was minted to collect, summed over the charges it covered —
   * the net outstanding at the time, which is the figure the parent saw. Null
   * when no history row exists (a reference minted before this table did), and
   * the caller then falls back to what is outstanding now.
   */
  mintedAmount: number | null
  /** True when the reference only resolves through history — the link was superseded. */
  supersededOnly: boolean
  error?: string
}

export async function resolveChargesForReference(
  db: Db,
  paymentReference: string
): Promise<ResolvedReference> {
  const { data: current, error: currentError } = await db
    .from('charges')
    .select(CHARGE_COLUMNS)
    .eq('payment_reference', paymentReference)

  if (currentError) {
    return { charges: [], mintedAmount: null, supersededOnly: false, error: currentError.message }
  }

  const charges: ReferenceCharge[] = [...((current ?? []) as ReferenceCharge[])]
  const seen = new Set(charges.map((c) => c.id))

  const { data: history, error: historyError } = await db
    .from('charge_payment_references')
    .select('charge_id, amount')
    .eq('payment_reference', paymentReference)

  if (historyError) {
    // An environment without the history table degrades to the old behaviour —
    // loudly, because until it is migrated an older link is unreconcilable.
    console.error('[payments/references] reference history unavailable', {
      paymentReference,
      error: historyError.message,
    })
    return {
      charges,
      mintedAmount: null,
      supersededOnly: false,
    }
  }

  const rows = (history ?? []) as Array<{ charge_id: string; amount: number | string | null }>
  const missingIds = rows.map((r) => r.charge_id).filter((id) => !seen.has(id))

  if (missingIds.length > 0) {
    const { data: historic, error: historicError } = await db
      .from('charges')
      .select(CHARGE_COLUMNS)
      .in('id', missingIds)

    if (historicError) {
      return { charges, mintedAmount: null, supersededOnly: false, error: historicError.message }
    }
    for (const charge of (historic ?? []) as ReferenceCharge[]) {
      if (seen.has(charge.id)) continue
      seen.add(charge.id)
      charges.push(charge)
    }
  }

  const minted = rows.reduce<number | null>((sum, row) => {
    if (row.amount == null) return sum
    return round2((sum ?? 0) + Number(row.amount))
  }, null)

  return {
    charges,
    mintedAmount: minted,
    supersededOnly: charges.length > 0 && (current ?? []).length === 0,
  }
}
