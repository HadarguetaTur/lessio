import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { monthlyChargeNote } from '@/lib/charges/renderNote'
import { logChargeAudit } from '@/lib/charges/audit'
import { resolveChargeDueDate } from '../chargeDueDate'

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
}: SyncMonthlyChargeInput): Promise<SyncMonthlyChargeResult> {
  const db = createServiceRoleClient()

  const { data: existingCharge, error: existingChargeError } = await db
    .from('charges')
    .select('id, status, paid_at')
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
