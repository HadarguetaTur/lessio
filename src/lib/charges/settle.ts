/**
 * Marks a set of open charges as paid in one go.
 *
 * "Record payment" closes one charge at a time — the right tool for a partial
 * payment inside a single charge, and the wrong one for the parent who hands
 * over the money for three of this month's five lessons. This walks the given
 * charges and records the remaining amount against each through
 * {@link recordChargePayment}, so each charge keeps its own `charge_payments`
 * row, audit trail, receipt and monthly-billing propagation exactly as if it
 * had been paid on its own.
 *
 * Not transactional on purpose: a failure on one charge must not undo the
 * payments already written for the others — those are real money received. The
 * result names what settled and what did not, so the caller can say so, and
 * groups the outcome per parent so each one can be told what they paid and
 * what they still owe.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OPEN_CHARGE_STATUSES, getChargeRemaining, sumRemaining } from './index'
import { recordChargePayment, type PaymentMethod } from './payments'

export interface SettleChargesInput {
  /** Any ids — closed charges and charges of another org are silently skipped. */
  chargeIds: string[]
  organizationId: string
  method: PaymentMethod
  paidAt?: string
  notes?: string | null
  actorProfileId: string | null
}

export interface SettledParent {
  parentId: string
  /** The charges of this parent that were just closed. */
  chargeIds: string[]
  /** Money recorded for this parent now. */
  amount: number
  /** What this parent still owes across every open charge after this. */
  remaining: number
}

export type SettleChargesResult =
  | {
      ok: true
      /** Charges that are now paid. */
      settledChargeIds: string[]
      /** Charges whose payment could not be written — still open. */
      failedChargeIds: string[]
      /** Money recorded across the settled charges. */
      total: number
      byParent: SettledParent[]
    }
  | { ok: false; reason: 'nothing_open' }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function settleCharges(input: SettleChargesInput): Promise<SettleChargesResult> {
  const { chargeIds, organizationId, method, notes, actorProfileId, paidAt } = input
  if (chargeIds.length === 0) return { ok: false, reason: 'nothing_open' }

  const db = createServiceRoleClient()

  const { data: charges, error } = await db
    .from('charges')
    .select('id, parent_id, amount, amount_paid')
    .eq('organization_id', organizationId)
    .in('id', chargeIds)
    .in('status', [...OPEN_CHARGE_STATUSES])
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  const open = (charges ?? [])
    .map((c) => ({
      id: c.id as string,
      parentId: c.parent_id as string,
      remaining: getChargeRemaining(c.amount, c.amount_paid),
    }))
    .filter((c) => c.remaining > 0)

  if (open.length === 0) return { ok: false, reason: 'nothing_open' }

  const settledChargeIds: string[] = []
  const failedChargeIds: string[] = []
  const perParent = new Map<string, SettledParent>()
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
        paidAt,
      })
      if (!result.ok) {
        console.error('[settleCharges] charge not settled', {
          chargeId: charge.id,
          organizationId,
          reason: result.reason,
        })
        failedChargeIds.push(charge.id)
        continue
      }
    } catch (err) {
      console.error('[settleCharges] charge payment threw', {
        chargeId: charge.id,
        organizationId,
        err,
      })
      failedChargeIds.push(charge.id)
      continue
    }

    settledChargeIds.push(charge.id)
    total = round2(total + charge.remaining)
    const entry = perParent.get(charge.parentId) ?? {
      parentId: charge.parentId,
      chargeIds: [],
      amount: 0,
      remaining: 0,
    }
    entry.chargeIds.push(charge.id)
    entry.amount = round2(entry.amount + charge.remaining)
    perParent.set(charge.parentId, entry)
  }

  // What each parent still owes, now that the payments are written — the
  // confirmation message quotes it. One query for every parent touched.
  if (perParent.size > 0) {
    const { data: stillOpen, error: openError } = await db
      .from('charges')
      .select('parent_id, amount, amount_paid')
      .eq('organization_id', organizationId)
      .in('parent_id', [...perParent.keys()])
      .in('status', [...OPEN_CHARGE_STATUSES])

    if (openError) {
      // Not worth failing the whole settlement over: the money is written. The
      // parent just gets a confirmation without a balance line.
      console.error('[settleCharges] remaining-balance lookup failed', {
        organizationId,
        error: openError.message,
      })
    } else {
      for (const entry of perParent.values()) {
        entry.remaining = sumRemaining(
          (stillOpen ?? []).filter((r) => r.parent_id === entry.parentId)
        )
      }
    }
  }

  return {
    ok: true,
    settledChargeIds,
    failedChargeIds,
    total,
    byParent: [...perParent.values()],
  }
}

// ─── Whole balance of one parent ────────────────────────────────────────────

export interface SettleParentBalanceInput {
  parentId: string
  organizationId: string
  method: PaymentMethod
  paidAt?: string
  notes?: string | null
  actorProfileId: string | null
}

export type SettleParentBalanceResult =
  | {
      ok: true
      settledChargeIds: string[]
      failedChargeIds: string[]
      total: number
    }
  | { ok: false; reason: 'nothing_open' }

/** Settles every open charge of one parent — {@link settleCharges} over their whole balance. */
export async function settleParentBalance(
  input: SettleParentBalanceInput
): Promise<SettleParentBalanceResult> {
  const { parentId, organizationId } = input
  const db = createServiceRoleClient()

  const { data: charges, error } = await db
    .from('charges')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('parent_id', parentId)
    .in('status', [...OPEN_CHARGE_STATUSES])

  if (error) throw new Error(error.message)

  const result = await settleCharges({
    chargeIds: (charges ?? []).map((c) => c.id as string),
    organizationId,
    method: input.method,
    notes: input.notes,
    actorProfileId: input.actorProfileId,
    paidAt: input.paidAt,
  })

  if (!result.ok) return result
  return {
    ok: true,
    settledChargeIds: result.settledChargeIds,
    failedChargeIds: result.failedChargeIds,
    total: result.total,
  }
}
