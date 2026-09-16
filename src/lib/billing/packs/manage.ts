/**
 * Reading and managing sold punch cards (decision #46): listing, a student's
 * cards, cancel, extend, and manual balance correction.
 *
 * Refunds (plan amendment §5): Lessio does not move money back. A paid card is
 * cancelled in two steps — record the refund on its `pack` charge, then cancel
 * the card with a reason. Cancelling a paid card with no refund marker is an
 * owner-only "cancel anyway". Every cancellation writes an `expire` row for the
 * credits left, so the balance reads 0; punches already used stay.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { voidCharge } from '@/lib/charges/resolve'
import { resolveBillingParent, MissingPrimaryParentError } from '@/lib/billing/resolveBillingParent'
import { getOrgTimezone } from '@/lib/organizations'
import type { OrganizationRole } from '@/lib/auth/roles'
import { packStatus, type PackStatus } from './status'

export interface PackRow {
  id: string
  organization_id: string
  product_id: string | null
  parent_id: string
  student_id: string | null
  billing_student_id: string | null
  name: string
  total_credits: number
  price: number
  covered_lesson_types: string[]
  purchased_at: string
  valid_from: string
  valid_until: string | null
  sold_billing_month: string
  activated_at: string | null
  charge_id: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  notes: string | null
  remaining: number
  used_count: number
}

export interface PackListItem extends PackRow {
  status: PackStatus
  studentName: string | null
  billingStudentName: string | null
  parentName: string | null
  charge: { status: string; amount_paid: number; refunded_at: string | null } | null
}

const PACK_COLUMNS =
  'id, organization_id, product_id, parent_id, student_id, billing_student_id, name, total_credits, price, covered_lesson_types, purchased_at, valid_from, valid_until, sold_billing_month, activated_at, charge_id, cancelled_at, cancel_reason, notes, remaining, used_count'

function toRow(raw: Record<string, unknown>): PackRow {
  return {
    ...(raw as unknown as PackRow),
    price: Number(raw.price),
    total_credits: Number(raw.total_credits),
    remaining: Number(raw.remaining),
    used_count: Number(raw.used_count),
  }
}

async function todayIn(organizationId: string): Promise<string> {
  const timezone = await getOrgTimezone(organizationId)
  return DateTime.now().setZone(timezone).toISODate()!
}

/** Adds names, charge state and derived status to raw balance rows. */
async function decorate(organizationId: string, rows: PackRow[]): Promise<PackListItem[]> {
  if (rows.length === 0) return []
  const db = createServiceRoleClient()
  const studentIds = [...new Set(rows.flatMap((r) => [r.student_id, r.billing_student_id]).filter(Boolean))] as string[]
  const parentIds = [...new Set(rows.map((r) => r.parent_id))]
  const chargeIds = rows.map((r) => r.charge_id).filter(Boolean) as string[]

  const [studentsRes, parentsRes, chargesRes, today] = await Promise.all([
    studentIds.length
      ? db.from('students').select('id, full_name').eq('organization_id', organizationId).in('id', studentIds)
      : Promise.resolve({ data: [], error: null }),
    db.from('parents').select('id, full_name').eq('organization_id', organizationId).in('id', parentIds),
    chargeIds.length
      ? db.from('charges').select('id, status, amount_paid, refunded_at').eq('organization_id', organizationId).in('id', chargeIds)
      : Promise.resolve({ data: [], error: null }),
    todayIn(organizationId),
  ])
  for (const res of [studentsRes, parentsRes, chargesRes]) {
    if (res.error) throw new Error(`[packs] decorate failed: ${res.error.message}`)
  }

  const names = new Map(((studentsRes.data ?? []) as Array<{ id: string; full_name: string }>).map((s) => [s.id, s.full_name]))
  const parents = new Map(((parentsRes.data ?? []) as Array<{ id: string; full_name: string }>).map((p) => [p.id, p.full_name]))
  const charges = new Map(
    ((chargesRes.data ?? []) as Array<{ id: string; status: string; amount_paid: number | string | null; refunded_at: string | null }>).map(
      (c) => [c.id, { status: c.status, amount_paid: Number(c.amount_paid ?? 0), refunded_at: c.refunded_at }]
    )
  )

  return rows.map((row) => ({
    ...row,
    status: packStatus(row, today),
    studentName: row.student_id ? names.get(row.student_id) ?? null : null,
    billingStudentName: row.billing_student_id ? names.get(row.billing_student_id) ?? null : null,
    parentName: parents.get(row.parent_id) ?? null,
    charge: row.charge_id ? charges.get(row.charge_id) ?? null : null,
  }))
}

export async function listPacks(organizationId: string): Promise<PackListItem[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_pack_balances')
    .select(PACK_COLUMNS)
    .eq('organization_id', organizationId)
    .order('purchased_at', { ascending: false })
  if (error) throw new Error(`[packs] list failed: ${error.message}`)
  return decorate(organizationId, ((data ?? []) as Record<string, unknown>[]).map(toRow))
}

/** A student's own cards and the family cards of their primary parent. */
export async function getStudentPacks(organizationId: string, studentId: string): Promise<PackListItem[]> {
  const db = createServiceRoleClient()
  let parentId: string | null = null
  try {
    parentId = await resolveBillingParent(studentId, organizationId)
  } catch (e) {
    if (!(e instanceof MissingPrimaryParentError)) throw e
  }
  let query = db.from('lesson_pack_balances').select(PACK_COLUMNS).eq('organization_id', organizationId)
  query = parentId
    ? query.or(`student_id.eq.${studentId},and(student_id.is.null,parent_id.eq.${parentId})`)
    : query.eq('student_id', studentId)
  const { data, error } = await query.order('purchased_at', { ascending: false })
  if (error) throw new Error(`[packs] student packs failed: ${error.message}`)
  return decorate(organizationId, ((data ?? []) as Record<string, unknown>[]).map(toRow))
}

async function loadPack(organizationId: string, packId: string): Promise<PackRow | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_pack_balances')
    .select(PACK_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('id', packId)
    .maybeSingle()
  if (error) throw new Error(`[packs] load failed: ${error.message}`)
  return data ? toRow(data as Record<string, unknown>) : null
}

export type CancelPackFailure =
  | 'not_found'
  | 'already_cancelled'
  | 'reason_required'
  /** Paid with no refund marker — record the refund first, or an owner cancels anyway. */
  | 'paid_not_refunded'
  /** A charge that could not be voided (shared link, racing payment). */
  | 'charge_locked'
  | 'failed'

export async function cancelPack(params: {
  organizationId: string
  packId: string
  actorProfileId: string
  role: OrganizationRole
  reason: string
  /** Owner-only: cancel a paid card that has no refund marker. */
  force?: boolean
}): Promise<{ ok: true } | { ok: false; reason: CancelPackFailure }> {
  const { organizationId, packId } = params
  const reason = params.reason.trim()
  if (!reason) return { ok: false, reason: 'reason_required' }

  const pack = await loadPack(organizationId, packId)
  if (!pack) return { ok: false, reason: 'not_found' }
  if (pack.cancelled_at) return { ok: false, reason: 'already_cancelled' }

  const db = createServiceRoleClient()

  if (pack.charge_id) {
    const { data: charge, error } = await db
      .from('charges')
      .select('id, status, refunded_at')
      .eq('id', pack.charge_id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (error) return { ok: false, reason: 'failed' }
    if (charge?.status === 'pending' || charge?.status === 'invoiced') {
      const voided = await voidCharge(charge.id as string, organizationId, params.actorProfileId, `pack_cancelled: ${reason}`)
      if (!voided.ok && voided.reason !== 'already_resolved') return { ok: false, reason: 'charge_locked' }
    } else if (charge?.status === 'paid' && !charge.refunded_at) {
      if (!(params.force && params.role === 'owner')) return { ok: false, reason: 'paid_not_refunded' }
    }
  }

  const nowIso = new Date().toISOString()
  const { data: updated, error: updateError } = await db
    .from('lesson_packs')
    .update({ cancelled_at: nowIso, cancel_reason: reason })
    .eq('id', packId)
    .eq('organization_id', organizationId)
    .is('cancelled_at', null)
    .select('id')
    .maybeSingle()
  if (updateError) return { ok: false, reason: 'failed' }
  if (!updated) return { ok: false, reason: 'already_cancelled' }

  if (pack.remaining > 0) {
    const { error: expireError } = await db.from('lesson_pack_ledger').insert({
      pack_id: packId,
      organization_id: organizationId,
      kind: 'expire',
      delta: -pack.remaining,
      reason: `cancelled: ${reason}`,
      actor_profile_id: params.actorProfileId,
    })
    if (expireError) {
      // The card is cancelled and unusable either way (the RPC skips cancelled
      // cards); the balance just keeps showing the old number until fixed.
      console.error('[packs] expire row failed after cancel', { packId, error: expireError.message })
    }
  }
  return { ok: true }
}

export type AdjustPackFailure = 'not_found' | 'cancelled' | 'invalid_delta' | 'reason_required' | 'negative_balance' | 'failed'

/** Owner/admin correction of a balance, with a reason. Never below zero. */
export async function adjustPackBalance(params: {
  organizationId: string
  packId: string
  delta: number
  reason: string
  actorProfileId: string
}): Promise<{ ok: true; remaining: number } | { ok: false; reason: AdjustPackFailure }> {
  const reason = params.reason.trim()
  if (!Number.isInteger(params.delta) || params.delta === 0 || Math.abs(params.delta) > 1000) {
    return { ok: false, reason: 'invalid_delta' }
  }
  if (!reason) return { ok: false, reason: 'reason_required' }
  const pack = await loadPack(params.organizationId, params.packId)
  if (!pack) return { ok: false, reason: 'not_found' }
  if (pack.cancelled_at) return { ok: false, reason: 'cancelled' }
  if (pack.remaining + params.delta < 0) return { ok: false, reason: 'negative_balance' }

  const db = createServiceRoleClient()
  const { error } = await db.from('lesson_pack_ledger').insert({
    pack_id: params.packId,
    organization_id: params.organizationId,
    kind: 'manual_adjust',
    delta: params.delta,
    reason,
    actor_profile_id: params.actorProfileId,
  })
  if (error) return { ok: false, reason: 'failed' }
  return { ok: true, remaining: pack.remaining + params.delta }
}

export type UpdatePackFailure = 'not_found' | 'cancelled' | 'invalid_dates' | 'failed'

/** Extension and notes. Credits change only through the ledger. */
export async function updatePack(params: {
  organizationId: string
  packId: string
  validUntil: string | null
  notes: string | null
}): Promise<{ ok: true } | { ok: false; reason: UpdatePackFailure }> {
  const pack = await loadPack(params.organizationId, params.packId)
  if (!pack) return { ok: false, reason: 'not_found' }
  if (pack.cancelled_at) return { ok: false, reason: 'cancelled' }
  if (params.validUntil && params.validUntil < pack.valid_from) return { ok: false, reason: 'invalid_dates' }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('lesson_packs')
    .update({ valid_until: params.validUntil, notes: params.notes?.trim() || null })
    .eq('id', params.packId)
    .eq('organization_id', params.organizationId)
  return error ? { ok: false, reason: 'failed' } : { ok: true }
}

/**
 * A refund was recorded on a charge. If it paid for a card that is still live,
 * owners and admins are told — the card is never cancelled automatically,
 * because a refund does not say what the org wants to happen to the credits.
 * Never throws: a refund marker must not fail because a notification did.
 */
export async function flagRefundedPack(chargeId: string, organizationId: string): Promise<void> {
  try {
    const db = createServiceRoleClient()
    const { data: pack } = await db
      .from('lesson_packs')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('charge_id', chargeId)
      .is('cancelled_at', null)
      .maybeSingle()
    if (!pack) return

    console.warn('[packs] pack_refunded_still_active', { organizationId, chargeId, packId: pack.id })
    const [{ notifyMultiple, getOwnerAndAdminProfileIds }, { getT }, { data: org }] = await Promise.all([
      import('@/lib/notifications'),
      import('@/lib/i18n/serverTranslator'),
      db.from('organizations').select('default_locale').eq('id', organizationId).maybeSingle(),
    ])
    const locale = org?.default_locale === 'en' ? 'en' : 'he'
    const t = await getT('packs', locale)
    const recipients = await getOwnerAndAdminProfileIds(organizationId)
    await notifyMultiple(
      organizationId,
      recipients,
      'pack_attention',
      t('notifications.refundedTitle'),
      t('notifications.refundedBody', { name: pack.name as string }),
      `/packs?status=all&open=${pack.id as string}`
    )
  } catch (err) {
    console.error('[packs] refund flag failed', { chargeId, organizationId, err })
  }
}
