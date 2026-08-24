import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logChargeAudit } from './audit'
import type { ChargeStatus } from './index'

/**
 * Statuses a charge can never leave: the money question is settled, either
 * because it was paid, forgiven (waived) or retracted (voided).
 */
export const TERMINAL_CHARGE_STATUSES = ['paid', 'waived', 'voided'] as const

export type ResolutionKind = 'waived' | 'voided'

export type ResolveChargeFailure =
  | 'not_found'
  /** Already paid — the reversal path is a credit note, not a waive. */
  | 'already_paid'
  /** Already waived or voided; nothing left to resolve. */
  | 'already_resolved'
  | 'update_failed'

export type ResolveChargeResult =
  | { ok: true; parentId: string | null; previousStatus: ChargeStatus }
  | { ok: false; reason: ResolveChargeFailure }

/**
 * A charge can only be waived or voided while it is still open. Paid charges
 * are reversed with a credit note instead, and a charge that is already
 * waived/voided has nowhere left to go.
 */
export function canTransition(from: ChargeStatus, to: ResolutionKind): boolean {
  if (to !== 'waived' && to !== 'voided') return false
  return from === 'pending' || from === 'invoiced'
}

interface ResolveChargeInput {
  chargeId: string
  organizationId: string
  actorProfileId: string
  reason: string
  kind: ResolutionKind
}

async function resolveCharge({
  chargeId,
  organizationId,
  actorProfileId,
  reason,
  kind,
}: ResolveChargeInput): Promise<ResolveChargeResult> {
  const db = createServiceRoleClient()

  const { data: charge, error: loadError } = await db
    .from('charges')
    .select('id, parent_id, status, amount, payment_link, billing_record_id')
    .eq('id', chargeId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (loadError) throw new Error(loadError.message)
  if (!charge) return { ok: false, reason: 'not_found' }

  const previousStatus = charge.status as ChargeStatus

  if (previousStatus === 'paid') return { ok: false, reason: 'already_paid' }
  if (!canTransition(previousStatus, kind)) {
    return { ok: false, reason: 'already_resolved' }
  }

  const now = new Date().toISOString()

  // The status filter makes this idempotent under concurrent resolves: a second
  // caller updates zero rows instead of overwriting the first resolution.
  const { data: updated, error: updateError } = await db
    .from('charges')
    .update({
      status: kind,
      resolved_at: now,
      resolved_by_profile_id: actorProfileId,
      resolution_reason: reason,
      updated_at: now,
    })
    .eq('id', chargeId)
    .eq('organization_id', organizationId)
    .in('status', ['pending', 'invoiced'])
    .select('id')
    .maybeSingle()

  if (updateError) {
    console.error('[resolveCharge] update failed', {
      chargeId,
      organizationId,
      kind,
      error: updateError.message,
    })
    return { ok: false, reason: 'update_failed' }
  }

  if (!updated) return { ok: false, reason: 'already_resolved' }

  await logChargeAudit({
    organizationId,
    chargeId,
    parentId: (charge.parent_id as string | null) ?? null,
    eventType: kind,
    actorProfileId,
    beforeStatus: previousStatus,
    afterStatus: kind,
    beforeAmount: Number(charge.amount),
    afterAmount: Number(charge.amount),
    reason,
    metadata: {
      // A payment link minted before the resolve stays live at the provider —
      // worth surfacing when reconciling a surprise payment later.
      had_payment_link: Boolean(charge.payment_link),
      billing_record_id: (charge.billing_record_id as string | null) ?? null,
    },
  })

  return {
    ok: true,
    parentId: (charge.parent_id as string | null) ?? null,
    previousStatus,
  }
}

/** Forgives an open charge: the parent no longer owes it. */
export function waiveCharge(
  chargeId: string,
  organizationId: string,
  actorProfileId: string,
  reason: string
): Promise<ResolveChargeResult> {
  return resolveCharge({ chargeId, organizationId, actorProfileId, reason, kind: 'waived' })
}

/** Retracts a charge that should never have existed (entered by mistake). */
export function voidCharge(
  chargeId: string,
  organizationId: string,
  actorProfileId: string,
  reason: string
): Promise<ResolveChargeResult> {
  return resolveCharge({ chargeId, organizationId, actorProfileId, reason, kind: 'voided' })
}
