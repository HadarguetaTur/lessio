import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { monthlyChargeNote } from '@/lib/charges/renderNote'
import { logChargeAudit } from '@/lib/charges/audit'
import { resolveChargeDueDate } from '../chargeDueDate'
import { assertMonthlyBillingHasNoIndividualChargeConflicts } from './conflicts'

type ChargeStatus = 'pending' | 'invoiced' | 'paid' | 'waived' | 'voided'

/**
 * A charge in one of these statuses is settled and must survive any recalc:
 * regenerating the month must never delete a waived charge, resurrect a voided
 * one, or reopen a paid one.
 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['paid', 'waived', 'voided'])

interface SyncMonthlyChargeInput {
  organizationId: string
  billingRecordId: string
  parentId: string | null
  billingMonth: string
  amount: number
  isApproved: boolean
  isPaid: boolean
  paidAtHint?: string | null
  periodEnd?: string | null
  dueDays?: number
}

interface SyncMonthlyChargeResult {
  chargeId: string | null
  chargeStatus: ChargeStatus | null
  isPaid: boolean
}

type ExistingMonthlyCharge = {
  id: string
  status: ChargeStatus
  paid_at: string | null
  amount: number | string | null
  amount_paid: number | string | null
}

export async function syncMonthlyCharge({
  organizationId,
  billingRecordId,
  parentId,
  billingMonth,
  amount,
  isApproved,
  isPaid,
  paidAtHint,
  periodEnd,
  dueDays = 7,
}: SyncMonthlyChargeInput): Promise<SyncMonthlyChargeResult> {
  const db = createServiceRoleClient()

  const { data: existingCharge, error: existingChargeError } = await db
    .from('charges')
    .select('id, status, paid_at, amount, amount_paid')
    .eq('organization_id', organizationId)
    .eq('billing_record_id', billingRecordId)
    .maybeSingle()

  if (existingChargeError) {
    throw new Error(`[syncMonthlyCharge] Failed to load existing charge: ${existingChargeError.message}`)
  }

  const existing = (existingCharge ?? null) as ExistingMonthlyCharge | null
  const effectiveIsPaid = isPaid || existing?.status === 'paid'

  // A settled charge is left exactly as it is — the recalc has nothing to say
  // about money that was already paid, forgiven or retracted.
  if (existing && existing.status !== 'paid' && TERMINAL_STATUSES.has(existing.status)) {
    return {
      chargeId: existing.id,
      chargeStatus: existing.status,
      isPaid: effectiveIsPaid,
    }
  }

  // A paid charge deliberately falls through the guard above so that a bill
  // flipped to paid still propagates — but its AMOUNT is settled money and must
  // not move. Rewriting it leaves amount_paid behind at the old figure, which
  // no screen shows because 'paid' is excluded from the open-charge queries,
  // and contradicts any receipt already issued. The caller is refused a silent
  // change; the correct route for one is a void or a credit note.
  if (existing && existing.status === 'paid') {
    const settledAmount = Number(existing.amount ?? 0)
    if (Math.round(settledAmount * 100) !== Math.round(amount * 100)) {
      console.error('[syncMonthlyCharge] refused to change the amount of a paid charge', {
        organizationId,
        billingRecordId,
        chargeId: existing.id,
        settledAmount,
        requestedAmount: amount,
      })
      await logChargeAudit({
        organizationId,
        chargeId: existing.id,
        parentId,
        eventType: 'sync_conflict',
        beforeAmount: settledAmount,
        afterAmount: amount,
        metadata: {
          source: 'monthly_billing',
          billing_month: billingMonth,
          refused: 'amount_change_on_paid_charge',
        },
      })
      return {
        chargeId: existing.id,
        chargeStatus: 'paid',
        isPaid: true,
      }
    }
  }

  if (!isApproved) {
    if (existing && existing.status !== 'paid') {
      const { error } = await db
        .from('charges')
        .delete()
        .eq('id', existing.id)
        .eq('organization_id', organizationId)

      if (error) {
        throw new Error(`[syncMonthlyCharge] Failed to delete unapproved charge: ${error.message}`)
      }
    }

    return {
      chargeId: existing?.status === 'paid' ? existing.id : null,
      chargeStatus: existing?.status === 'paid' ? 'paid' : null,
      isPaid: effectiveIsPaid,
    }
  }

  if (!parentId) {
    return {
      chargeId: existing?.id ?? null,
      chargeStatus: existing?.status ?? null,
      isPaid: effectiveIsPaid,
    }
  }

  await assertMonthlyBillingHasNoIndividualChargeConflicts(organizationId, billingRecordId)

  const chargeStatus: ChargeStatus = effectiveIsPaid
    ? 'paid'
    : existing?.status === 'invoiced'
      ? 'invoiced'
      : 'pending'

  const paidAt = effectiveIsPaid
    ? existing?.paid_at ?? paidAtHint ?? new Date().toISOString()
    : null

  const payload = {
    organization_id: organizationId,
    parent_id: parentId,
    billing_record_id: billingRecordId,
    billing_month: billingMonth,
    amount,
    charge_type: 'monthly',
    status: chargeStatus,
    notes: monthlyChargeNote(billingMonth),
    paid_at: paidAt,
    // Derived from the month being billed, so recalculating an old month does
    // not push its due date forward. Safe to keep in the shared payload for
    // both the insert and the update precisely because it is idempotent.
    due_date: resolveChargeDueDate({
      chargeType: 'monthly',
      issuedAt: new Date(),
      billingMonth,
      periodEnd,
      dueDays,
      timezone: 'UTC',
    }),
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await db
      .from('charges')
      .update(payload)
      .eq('id', existing.id)
      .eq('organization_id', organizationId)

    if (error) {
      throw new Error(`[syncMonthlyCharge] Failed to update charge: ${error.message}`)
    }

    return {
      chargeId: existing.id,
      chargeStatus,
      isPaid: effectiveIsPaid,
    }
  }

  const { data: insertedCharge, error: insertError } = await db
    .from('charges')
    .insert(payload)
    .select('id')
    .single()

  if (insertError || !insertedCharge) {
    throw new Error(`[syncMonthlyCharge] Failed to insert charge: ${insertError?.message ?? 'missing inserted row'}`)
  }

  await logChargeAudit({
    organizationId,
    chargeId: insertedCharge.id as string,
    parentId,
    eventType: 'created',
    afterStatus: chargeStatus,
    afterAmount: amount,
    metadata: { source: 'monthly_billing', billing_month: billingMonth },
  })

  return {
    chargeId: insertedCharge.id as string,
    chargeStatus,
    isPaid: effectiveIsPaid,
  }
}
