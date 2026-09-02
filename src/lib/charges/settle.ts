/**
 * Settles a parent's whole open balance in one go.
 *
 * "Record payment" closes one charge at a time — the right tool for a partial
 * payment or for paying a single lesson, and the wrong one for the parent who
 * hands over the month's total. This walks every open charge of the parent and
 * records the remaining amount against each through {@link recordChargePayment},
 * so each charge keeps its own `charge_payments` row, audit trail, receipt and
 * monthly-billing propagation exactly as if it had been paid on its own.
 *
 * Not transactional on purpose: a failure on one charge must not undo the
 * payments already written for the others — those are real money received. The
 * result names what settled and what did not, so the caller can say so.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OPEN_CHARGE_STATUSES, getChargeRemaining } from './index'
import { recordChargePayment, type PaymentMethod } from './payments'

export interface SettleParentBalanceInput {
  parentId: string
  organizationId: string
  method: PaymentMethod
  notes?: string | null
  actorProfileId: string | null
}

export type SettleParentBalanceResult =
  | {
      ok: true
      /** Charges that are now paid. */
      settledChargeIds: string[]
      /** Charges whose payment could not be written — still open. */
      failedChargeIds: string[]
      /** Money recorded across the settled charges. */
      total: number
    }
  | { ok: false; reason: 'nothing_open' }

export async function settleParentBalance(
  input: SettleParentBalanceInput
): Promise<SettleParentBalanceResult> {
  const { parentId, organizationId, method, notes, actorProfileId } = input
  const db = createServiceRoleClient()

  const { data: charges, error } = await db
    .from('charges')
    .select('id, amount, amount_paid')
    .eq('organization_id', organizationId)
    .eq('parent_id', parentId)
    .in('status', [...OPEN_CHARGE_STATUSES])
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  const open = (charges ?? [])
    .map((c) => ({ id: c.id as string, remaining: getChargeRemaining(c.amount, c.amount_paid) }))
    .filter((c) => c.remaining > 0)

  if (open.length === 0) return { ok: false, reason: 'nothing_open' }

  const settledChargeIds: string[] = []
  const failedChargeIds: string[] = []
  let total = 0

  // Sequential: each call writes a ledger row and closes a charge, and the
  // order of the audit trail should match the order the money was applied.
  for (const charge of open) {
    try {
      const result = await recordChargePayment({
        chargeId: charge.id,
        organizationId,
        amount: charge.remaining,
        method,
        notes: notes ?? null,
        actorProfileId,
      })
      if (result.ok) {
        settledChargeIds.push(charge.id)
        total = Math.round((total + charge.remaining) * 100) / 100
      } else {
        console.error('[settleParentBalance] charge not settled', {
          chargeId: charge.id,
          organizationId,
          reason: result.reason,
        })
        failedChargeIds.push(charge.id)
      }
    } catch (err) {
      console.error('[settleParentBalance] charge payment threw', {
        chargeId: charge.id,
        organizationId,
        err,
      })
      failedChargeIds.push(charge.id)
    }
  }

  return { ok: true, settledChargeIds, failedChargeIds, total }
}
