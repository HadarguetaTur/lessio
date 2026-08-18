import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { monthlyChargeNote } from '@/lib/charges/renderNote'

type ChargeStatus = 'pending' | 'invoiced' | 'paid'

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

  return {
    chargeId: insertedCharge.id as string,
    chargeStatus,
    isPaid: effectiveIsPaid,
  }
}
