/**
 * Refund markers on a charge.
 *
 * Lessio does not move money back and does not issue the credit note — the
 * provider or the bank does the first, a licensed receipt provider does the
 * second (decision #37). What this module exists for is narrower and, until
 * now, missing entirely: recording THAT a refund happened, so the rest of the
 * product stops asserting something false about it.
 *
 * Before this, after a refund:
 *   - the revenue KPI, the revenue report and the CSV export kept counting the
 *     money (all of them SUM charge_payments.amount, which only grows);
 *   - the parent portal kept showing a green "paid" badge linking to a receipt
 *     for money that had gone back.
 *
 * Two things write a marker: an owner/admin recording it by hand, and the
 * PayPlus webhook, whose adapter already detects a reversal (`isRefund`) and
 * used to throw the signal away.
 *
 * WHAT IS STILL MANUAL, deliberately: moving the money, issuing the credit
 * note, and deciding whether the parent now owes the amount again. A refunded
 * charge is NOT re-opened as debt — a refund is usually a cancellation, not an
 * unpaid bill, and guessing wrong would chase a parent for money the org chose
 * to give back.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logChargeAudit } from './audit'
import { flagRefundedPack } from '@/lib/billing/packs/manage'

export type RefundSource = 'manual' | 'provider_webhook'

export type MarkChargeRefundedFailure =
  | 'not_found'
  /** Nothing was ever collected, so there is nothing to send back. */
  | 'not_paid'
  /** A marker is already on this charge; refunds are recorded once. */
  | 'already_refunded'
  /** More than what came in. */
  | 'amount_exceeds_paid'
  | 'invalid_amount'
  | 'update_failed'

export type MarkChargeRefundedResult =
  | { ok: true; refundedAmount: number; parentId: string | null }
  | { ok: false; reason: MarkChargeRefundedFailure }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Records that money went back to the parent.
 *
 * Idempotent: the UPDATE is guarded on `refunded_at IS NULL`, so a duplicate
 * webhook or a double-tap writes one marker and reports 'already_refunded'
 * rather than overwriting the first record or logging a second audit row.
 *
 * @param amount how much went back. Defaults to everything collected.
 * @param actorProfileId null for a provider webhook — nobody in Lessio did it.
 */
export async function markChargeRefunded(params: {
  chargeId: string
  organizationId: string
  actorProfileId: string | null
  amount?: number | null
  reason: string
  source: RefundSource
  /** Provider reference, for the audit trail. */
  paymentReference?: string | null
}): Promise<MarkChargeRefundedResult> {
  const db = createServiceRoleClient()

  const { data: charge, error: loadError } = await db
    .from('charges')
    .select('id, parent_id, status, amount, amount_paid, refunded_at, receipt_url')
    .eq('id', params.chargeId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()

  if (loadError) throw new Error(loadError.message)
  if (!charge) return { ok: false, reason: 'not_found' }
  if (charge.refunded_at) return { ok: false, reason: 'already_refunded' }

  const collected = round2(Number(charge.amount_paid ?? 0))
  if (collected <= 0) return { ok: false, reason: 'not_paid' }

  const requested = params.amount == null ? collected : round2(Number(params.amount))
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, reason: 'invalid_amount' }
  }
  // Half a cent of slack, the same tolerance the payment webhook uses when it
  // decides a charge is settled.
  if (requested > collected + 0.005) return { ok: false, reason: 'amount_exceeds_paid' }

  const now = new Date().toISOString()

  const { data: updated, error: updateError } = await db
    .from('charges')
    .update({
      refunded_at: now,
      refunded_amount: requested,
      refund_reason: params.reason,
      refunded_by_profile_id: params.actorProfileId,
      updated_at: now,
    })
    .eq('id', params.chargeId)
    .eq('organization_id', params.organizationId)
    .is('refunded_at', null)
    .select('id')
    .maybeSingle()

  if (updateError) {
    console.error('[refunds] update failed', {
      chargeId: params.chargeId,
      organizationId: params.organizationId,
      error: updateError.message,
    })
    return { ok: false, reason: 'update_failed' }
  }

  // Lost the race with a concurrent marker. The other one stands.
  if (!updated) return { ok: false, reason: 'already_refunded' }

  await logChargeAudit({
    organizationId: params.organizationId,
    chargeId: params.chargeId,
    parentId: (charge.parent_id as string | null) ?? null,
    eventType: 'refunded',
    actorProfileId: params.actorProfileId,
    beforeStatus: charge.status as string,
    // Status is unchanged on purpose — see the migration header.
    afterStatus: charge.status as string,
    beforeAmount: Number(charge.amount),
    afterAmount: Number(charge.amount),
    reason: params.reason,
    metadata: {
      refunded_amount: requested,
      amount_paid_at_refund: collected,
      source: params.source,
      payment_reference: params.paymentReference ?? null,
      // A receipt was issued for money that has now gone back. The credit note
      // is the receipt provider's job, not ours (decision #37), so the fact is
      // recorded here for whoever reconciles it.
      receipt_needs_credit_note: Boolean(charge.receipt_url),
    },
  })

  // A refund on a punch card's charge leaves the card live; say so.
  await flagRefundedPack(params.chargeId, params.organizationId)

  return {
    ok: true,
    refundedAmount: requested,
    parentId: (charge.parent_id as string | null) ?? null,
  }
}

/**
 * Refunds recorded in a window, for netting revenue.
 *
 * Net revenue for a period = payments received in it MINUS refunds recorded in
 * it. Refunds are bucketed by when they were recorded rather than by the
 * original payment date, for the same reason payments are bucketed by
 * `paid_at`: a report for last month should not change after the fact.
 */
export async function getRefundsSince(
  orgId: string,
  fromIso: string
): Promise<{ refunded_at: string; refunded_amount: number }[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('charges')
    .select('refunded_at, refunded_amount')
    .eq('organization_id', orgId)
    .not('refunded_at', 'is', null)
    .gte('refunded_at', fromIso)

  if (error) throw new Error(`Refund query failed: ${error.message}`)

  return ((data ?? []) as { refunded_at: string | null; refunded_amount: number | string | null }[])
    .filter((r): r is { refunded_at: string; refunded_amount: number | string } =>
      Boolean(r.refunded_at) && r.refunded_amount != null
    )
    .map((r) => ({ refunded_at: r.refunded_at, refunded_amount: Number(r.refunded_amount) }))
}
