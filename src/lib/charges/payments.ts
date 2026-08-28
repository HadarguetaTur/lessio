import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logChargeAudit } from './audit'
import { markChargeAsPaid, type ChargeStatus } from './index'
import { remainingAmount, round2, type ChargePayment, type PaymentMethod } from './paymentMethods'

export {
  PAYMENT_METHODS,
  remainingAmount,
  round2,
  type ChargePayment,
  type PaymentMethod,
} from './paymentMethods'

export type RecordPaymentFailure =
  | 'not_found'
  /** Waived, voided, or already fully paid — nothing left to collect. */
  | 'not_open'
  /** Amount is zero, negative, or larger than what is still owed. */
  | 'invalid_amount'
  | 'insert_failed'

export type RecordPaymentResult =
  | { ok: true; amountPaid: number; remaining: number; closed: boolean }
  | { ok: false; reason: RecordPaymentFailure; remaining?: number }

const OPEN: ReadonlySet<string> = new Set(['pending', 'invoiced'])

interface RecordChargePaymentInput {
  chargeId: string
  organizationId: string
  amount: number
  method?: PaymentMethod
  notes?: string | null
  /**
   * NULL when no person recorded this — a payment webhook, or an /api/v1 call
   * from the org's own automation. charge_payments.recorded_by_profile_id is
   * nullable for exactly this case.
   */
  actorProfileId: string | null
  paidAt?: string
}

/**
 * Records a payment against a charge — in full or in part.
 *
 * A payment that covers the remaining balance closes the charge through
 * {@link markChargeAsPaid}, so receipt issuance and the monthly-billing
 * `is_paid` propagation stay in one place instead of being duplicated here.
 */
export async function recordChargePayment({
  chargeId,
  organizationId,
  amount,
  method = 'manual',
  notes,
  actorProfileId,
  paidAt,
}: RecordChargePaymentInput): Promise<RecordPaymentResult> {
  const db = createServiceRoleClient()

  const { data: charge, error: loadError } = await db
    .from('charges')
    .select('id, parent_id, status, amount, amount_paid')
    .eq('id', chargeId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (loadError) throw new Error(loadError.message)
  if (!charge) return { ok: false, reason: 'not_found' }
  if (!OPEN.has(charge.status as string)) return { ok: false, reason: 'not_open' }

  const total = Number(charge.amount)
  const alreadyPaid = Number(charge.amount_paid ?? 0)
  const remaining = remainingAmount(total, alreadyPaid)
  const payment = round2(amount)

  if (!Number.isFinite(payment) || payment <= 0 || payment > remaining) {
    return { ok: false, reason: 'invalid_amount', remaining }
  }

  const paidAtIso = paidAt ?? new Date().toISOString()

  const { error: insertError } = await db.from('charge_payments').insert({
    organization_id: organizationId,
    charge_id: chargeId,
    parent_id: (charge.parent_id as string | null) ?? null,
    amount: payment,
    method,
    paid_at: paidAtIso,
    recorded_by_profile_id: actorProfileId,
    notes: notes?.trim() || null,
  })

  if (insertError) {
    console.error('[recordChargePayment] insert failed', {
      chargeId,
      organizationId,
      error: insertError.message,
    })
    return { ok: false, reason: 'insert_failed' }
  }

  const newAmountPaid = round2(alreadyPaid + payment)
  const closed = newAmountPaid >= total

  // Written before the close call below on purpose: markChargeAsPaid records a
  // settlement payment for whatever is still outstanding, and this payment is
  // already in charge_payments.
  const { error: updateError } = await db
    .from('charges')
    .update({ amount_paid: newAmountPaid, updated_at: new Date().toISOString() })
    .eq('id', chargeId)
    .eq('organization_id', organizationId)

  if (updateError) throw new Error(updateError.message)

  if (closed) {
    // Closes the charge and carries the receipt / billing propagation with it.
    await markChargeAsPaid(chargeId, organizationId, undefined, actorProfileId)
  }

  await logChargeAudit({
    organizationId,
    chargeId,
    parentId: (charge.parent_id as string | null) ?? null,
    eventType: 'payment_recorded',
    actorProfileId,
    beforeStatus: charge.status as ChargeStatus,
    afterStatus: closed ? 'paid' : (charge.status as ChargeStatus),
    beforeAmount: alreadyPaid,
    afterAmount: newAmountPaid,
    reason: notes?.trim() || null,
    metadata: { payment: payment, method, total },
  })

  return {
    ok: true,
    amountPaid: newAmountPaid,
    remaining: remainingAmount(total, newAmountPaid),
    closed,
  }
}

export async function getChargePayments(
  organizationId: string,
  chargeId: string
): Promise<ChargePayment[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('charge_payments')
    .select('id, amount, method, paid_at, notes, profiles(full_name)')
    .eq('organization_id', organizationId)
    .eq('charge_id', chargeId)
    .order('paid_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown> & {
      // PostgREST returns the embedded profile as an object or a one-element array
      // depending on how it resolves the relationship.
      profiles?: { full_name: string | null } | { full_name: string | null }[] | null
    }
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return {
      id: r.id as string,
      amount: Number(r.amount),
      method: r.method as PaymentMethod,
      paidAt: r.paid_at as string,
      notes: (r.notes as string | null) ?? null,
      recordedBy: profile?.full_name ?? null,
    }
  })
}
