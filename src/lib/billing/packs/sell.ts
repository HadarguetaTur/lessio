/**
 * Selling a punch card (decision #46).
 *
 * A sale is always made from a student. The org's `pack_scope` decides whose
 * card it becomes: 'student' → that student only; 'family' → every child of
 * the student's primary parent (student_id NULL). Either way the student it was
 * sold from is `billing_student_id`, whose monthly bill carries the sale in a
 * monthly org.
 *
 * The product is snapshotted: editing or archiving it later changes nothing
 * about a card already sold.
 *
 * Money follows the billing mode:
 *   per_lesson → a `pack` charge (payment request sent by the caller)
 *   monthly    → no charge; the monthly engine bills `lesson_packs.price`
 * Activation: immediate, or on full payment of that charge when the policy is
 * 'on_payment'. A monthly org and a free card are always immediate.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logChargeAudit } from '@/lib/charges/audit'
import { voidCharge } from '@/lib/charges/resolve'
import { resolveBillingParent, MissingPrimaryParentError } from '@/lib/billing/resolveBillingParent'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { getOrgTimezone } from '@/lib/organizations'
import { resolveChargeDueDate } from '@/lib/billing/chargeDueDate'
import { getCurrentBillingMonth } from '@/lib/billing/monthly/month'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'
import type { PackScope } from '@/lib/cancellation-policy/collection'

export type SellPackFailure = 'product_not_found' | 'student_not_found' | 'missing_parent' | 'invalid_price' | 'failed'

export type SellPackResult =
  | { ok: true; packId: string; chargeId: string | null; activated: boolean; parentId: string }
  | { ok: false; reason: SellPackFailure }

export async function sellPack(params: {
  organizationId: string
  productId: string
  studentId: string
  /** Defaults to the org policy. */
  scope?: PackScope
  /** Owner-only override of the catalog price. */
  priceOverride?: number | null
  notes?: string | null
  actorProfileId: string | null
  /**
   * A booking checkout already created and collected the `pack` charge
   * (booking_checkout_sessions). The card is issued against it, active at once.
   */
  existingChargeId?: string | null
  now?: Date
}): Promise<SellPackResult> {
  const { organizationId, productId, studentId } = params
  const db = createServiceRoleClient()
  const now = params.now ?? new Date()

  const [{ data: product }, { data: student }] = await Promise.all([
    db
      .from('lesson_pack_products')
      .select('id, name, credits, price, covered_lesson_types, validity_days')
      .eq('id', productId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle(),
    db.from('students').select('id').eq('id', studentId).eq('organization_id', organizationId).maybeSingle(),
  ])
  if (!product) return { ok: false, reason: 'product_not_found' }
  if (!student) return { ok: false, reason: 'student_not_found' }

  const price = params.priceOverride ?? Number(product.price)
  if (!Number.isFinite(price) || price < 0) return { ok: false, reason: 'invalid_price' }

  let parentId: string
  try {
    parentId = await resolveBillingParent(studentId, organizationId)
  } catch (e) {
    if (e instanceof MissingPrimaryParentError) return { ok: false, reason: 'missing_parent' }
    throw e
  }

  const [billing, timezone, collection] = await Promise.all([
    getOrgBillingPolicy(organizationId),
    getOrgTimezone(organizationId),
    getCollectionPolicyServiceRole(organizationId),
  ])
  const scope = params.scope ?? collection.packScope
  const today = DateTime.fromJSDate(now).setZone(timezone)
  const validFrom = today.toISODate()!
  const validUntil = product.validity_days ? today.plus({ days: Number(product.validity_days) }).toISODate() : null
  const soldBillingMonth = getCurrentBillingMonth(timezone, today, billing.cycleStartDay)

  const prepaid = Boolean(params.existingChargeId)
  const needsCharge = !prepaid && billing.billingMode !== 'monthly' && price > 0
  const activated = prepaid || !needsCharge || collection.packActivation === 'immediate'
  const nowIso = now.toISOString()

  let chargeId: string | null = params.existingChargeId ?? null
  if (needsCharge) {
    const { data: charge, error: chargeError } = await db
      .from('charges')
      .insert({
        organization_id: organizationId,
        parent_id: parentId,
        student_id: studentId,
        amount: price,
        charge_type: 'pack',
        status: 'pending',
        due_date: resolveChargeDueDate({ chargeType: 'pack', issuedAt: now, timezone }),
      })
      .select('id')
      .single()
    if (chargeError || !charge) {
      console.error('[sellPack] charge insert failed', { organizationId, studentId, error: chargeError?.message })
      return { ok: false, reason: 'failed' }
    }
    chargeId = charge.id as string
    await logChargeAudit({
      organizationId,
      chargeId,
      parentId,
      eventType: 'created',
      actorProfileId: params.actorProfileId,
      afterStatus: 'pending',
      afterAmount: price,
      metadata: { source: 'pack_sold', product_id: productId, student_id: studentId, scope },
    })
  }

  // Never void a checkout's charge: that money is already collected.
  const undoCharge = async (reason: string) => {
    if (chargeId && !prepaid) await voidCharge(chargeId, organizationId, null, reason)
  }

  const { data: pack, error: packError } = await db
    .from('lesson_packs')
    .insert({
      organization_id: organizationId,
      product_id: productId,
      parent_id: parentId,
      student_id: scope === 'family' ? null : studentId,
      billing_student_id: studentId,
      name: product.name,
      total_credits: product.credits,
      price,
      covered_lesson_types: product.covered_lesson_types,
      purchased_at: nowIso,
      valid_from: validFrom,
      valid_until: validUntil,
      sold_billing_month: soldBillingMonth,
      activated_at: activated ? nowIso : null,
      charge_id: chargeId,
      notes: params.notes?.trim() || null,
      created_by: params.actorProfileId,
    })
    .select('id')
    .single()
  if (packError || !pack) {
    console.error('[sellPack] pack insert failed', { organizationId, studentId, error: packError?.message })
    await undoCharge('pack_sale_failed')
    return { ok: false, reason: 'failed' }
  }

  const { error: ledgerError } = await db.from('lesson_pack_ledger').insert({
    pack_id: pack.id,
    organization_id: organizationId,
    student_id: studentId,
    kind: 'purchase',
    delta: Number(product.credits),
    actor_profile_id: params.actorProfileId,
  })
  if (ledgerError) {
    // A pack with no purchase row has zero credits and would confuse everyone.
    console.error('[sellPack] purchase ledger insert failed — rolling the sale back', {
      organizationId,
      packId: pack.id,
      error: ledgerError.message,
    })
    await db.from('lesson_packs').delete().eq('id', pack.id).eq('organization_id', organizationId)
    await undoCharge('pack_sale_failed')
    return { ok: false, reason: 'failed' }
  }

  return { ok: true, packId: pack.id as string, chargeId, activated, parentId }
}
