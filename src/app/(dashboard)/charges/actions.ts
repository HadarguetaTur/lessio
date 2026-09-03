'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { getSession, requireMutation } from '@/lib/auth/session'
import { assertOrgNotSaasReadOnly } from '@/lib/saas/featureGate'
import { waiveCharge, voidCharge, type ResolveChargeResult } from '@/lib/charges/resolve'
import { recordChargePayment, type PaymentMethod } from '@/lib/charges/payments'
import { settleCharges, settleParentBalance } from '@/lib/charges/settle'
import { notifyParentOfPayment } from '@/lib/charges/notifyParentOfPayment'
import {
  decideNotificationStatus,
  type PaymentNotificationStatus,
} from '@/lib/charges/notificationStatus'
import { issueReceiptForCharge } from '@/lib/receipts/issueReceiptForCharge'
import { sendEmail, shouldSendEmail } from '@/lib/email'
import { receiptEmail } from '@/lib/email/templates/receipt'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations, getLocale } from 'next-intl/server'
import { formatMoney } from '@/lib/i18n/formatCurrency'

function revalidateChargeSurfaces() {
  revalidatePath('/charges')
  revalidatePath('/parents')
  revalidatePath('/dashboard')
  revalidatePath('/billing')
  revalidatePath('/billing/debts')
  revalidatePath('/reports/debt')
}

export interface ManualPaymentResult {
  error: string | null
  notification?: PaymentNotificationStatus
}

/** Gathers what `decideNotificationStatus` needs, then lets it decide. */
async function resolveNotificationStatus(
  orgId: string,
  parentId: string | null,
  notifyParent: boolean | undefined
): Promise<PaymentNotificationStatus> {
  // An explicit "no" needs no lookup — nothing else can overturn it.
  if (notifyParent === false || !parentId) return 'disabled'

  const db = createServiceRoleClient()
  const [{ data: parent }, { data: org }] = await Promise.all([
    db.from('parents').select('phone').eq('id', parentId).eq('organization_id', orgId).maybeSingle(),
    db
      .from('organizations')
      .select('whatsapp_phone_number_id, whatsapp_access_token, payment_confirmation_default_enabled')
      .eq('id', orgId)
      .maybeSingle(),
  ])

  return decideNotificationStatus({
    notifyParent,
    orgDefault: org?.payment_confirmation_default_enabled ?? true,
    hasParent: true,
    hasPhone: Boolean(parent?.phone),
    whatsappConnected: Boolean(org?.whatsapp_phone_number_id && org?.whatsapp_access_token),
  })
}

/**
 * Everything a manual payment owes the parent once the money is written:
 * receipts (and their email) for the charges that closed, then one WhatsApp
 * confirmation that carries the receipt links. Runs after the response — it
 * must not block or fail the payment, but must outlive the lambda.
 *
 * Receipt issuance passes `notifyParent: false` so the parent is not sent the
 * receipt twice: once here inside the confirmation and once by the receipt path.
 */
function afterManualPayment(p: {
  orgId: string
  parentId: string | null
  chargeIds: string[]
  closedChargeIds: string[]
  amount: number
  remaining: number
  notifyParent: boolean
}): Promise<void> {
  return runAfterResponse(
    (async () => {
      const receiptUrls: string[] = []
      for (const chargeId of p.closedChargeIds) {
        const url = await issueReceiptForCharge(chargeId, p.orgId, { notifyParent: false }).catch((err) => {
          console.error('[charges] receipt issuance failed — charge already paid', {
            chargeId,
            orgId: p.orgId,
            err,
          })
          return null
        })
        if (url) receiptUrls.push(url)
        await sendReceiptEmail(chargeId, p.orgId).catch((err) => {
          console.error('[charges] receipt email failed', { chargeId, orgId: p.orgId, err })
        })
      }

      if (p.notifyParent && p.parentId) {
        await notifyParentOfPayment({
          orgId: p.orgId,
          parentId: p.parentId,
          chargeIds: p.chargeIds,
          amount: p.amount,
          remaining: p.remaining,
          receiptUrls,
        })
      }
    })()
  )
}

// ─── Waive / void ──────────────────────────────────────────────────────────

const resolveChargeSchema = z.object({
  chargeId: z.string().uuid(),
  reason: z.string().min(1).max(500),
})

/**
 * Forgives an open charge — the parent no longer owes it, but the charge stays
 * in the ledger with who waived it and why. Owner and admin.
 */
export async function waiveChargeAction(
  chargeId: string,
  reason: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  return runResolve(() =>
    waiveCharge(chargeId, session.orgId, session.profileId, reason.trim()),
    { chargeId, reason }
  )
}

/**
 * Retracts a charge that should never have existed. Owner only: voiding rewrites
 * a bookkeeping fact, the same bar `markBillingAsPaid` sets.
 */
export async function voidChargeAction(
  chargeId: string,
  reason: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)

  if (session.role !== 'owner') {
    return { error: await commonError('ownerOnly') }
  }

  return runResolve(() =>
    voidCharge(chargeId, session.orgId, session.profileId, reason.trim()),
    { chargeId, reason }
  )
}

// ─── Record a payment (full or partial) ────────────────────────────────────

const paymentMethodSchema = z.enum(['manual', 'cash', 'bank_transfer', 'provider', 'other'])

const recordPaymentSchema = z.object({
  chargeId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  method: paymentMethodSchema,
  notes: z.string().max(500).optional(),
  /** Omitted means "fall back to the org default" — see resolveNotificationStatus. */
  notifyParent: z.boolean().optional(),
})

/**
 * Records money received against a charge. A payment that covers the remaining
 * balance closes the charge (receipt included); anything less leaves the
 * remainder as open debt. Either way the parent gets a confirmation unless the
 * tutor unticked it.
 */
export async function recordChargePaymentAction(input: {
  chargeId: string
  amount: number
  method: PaymentMethod
  notes?: string
  notifyParent?: boolean
}): Promise<ManualPaymentResult> {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)
  const t = await getTranslations('charges.errors')

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const parsed = recordPaymentSchema.safeParse(input)
  if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

  let result
  try {
    result = await recordChargePayment({
      chargeId: parsed.data.chargeId,
      organizationId: session.orgId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      notes: parsed.data.notes ?? null,
      actorProfileId: session.profileId,
    })
  } catch (err) {
    console.error('[charges] record payment failed', { chargeId: input.chargeId, err })
    return { error: t('updateStatusFailed') }
  }

  if (!result.ok) {
    switch (result.reason) {
      case 'not_found':
        return { error: await commonError('notFound') }
      case 'not_open':
        return { error: t('chargeNotOpen') }
      case 'invalid_amount':
        return { error: t('paymentTooLarge', { max: formatMoney(result.remaining ?? 0, await getLocale()) }) }
      default:
        return { error: t('updateStatusFailed') }
    }
  }

  revalidateChargeSurfaces()
  revalidatePath(`/charges/${parsed.data.chargeId}`)

  const notification = await resolveNotificationStatus(
    session.orgId,
    result.parentId,
    parsed.data.notifyParent
  )

  await afterManualPayment({
    orgId: session.orgId,
    parentId: result.parentId,
    chargeIds: [parsed.data.chargeId],
    closedChargeIds: result.closed ? [parsed.data.chargeId] : [],
    amount: parsed.data.amount,
    remaining: result.remaining,
    notifyParent: notification === 'queued',
  })

  return { error: null, notification }
}

// ─── Settle a parent's whole balance ───────────────────────────────────────

const settleBalanceSchema = z.object({
  parentId: z.string().uuid(),
  method: paymentMethodSchema,
  notes: z.string().max(500).optional(),
  /** Omitted means "fall back to the org default" — see resolveNotificationStatus. */
  notifyParent: z.boolean().optional(),
})

export interface SettleBalanceResult extends ManualPaymentResult {
  /** How many charges were closed — for the toast. */
  settled?: number
  /** How many stayed open because their payment could not be written. */
  failed?: number
}

/**
 * Marks every open charge of a parent as paid in one go — the parent who hands
 * over the month's total should not cost the tutor one dialog per lesson.
 * Per-charge partial payments stay on "record payment".
 */
export async function settleParentBalanceAction(input: {
  parentId: string
  method: PaymentMethod
  notes?: string
  notifyParent?: boolean
}): Promise<SettleBalanceResult> {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)
  const t = await getTranslations('charges.errors')

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const parsed = settleBalanceSchema.safeParse(input)
  if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

  let result
  try {
    result = await settleParentBalance({
      parentId: parsed.data.parentId,
      organizationId: session.orgId,
      method: parsed.data.method,
      notes: parsed.data.notes ?? null,
      actorProfileId: session.profileId,
    })
  } catch (err) {
    console.error('[charges] settle balance failed', { parentId: input.parentId, err })
    return { error: t('updateStatusFailed') }
  }

  if (!result.ok) {
    return { error: t('nothingOpen') }
  }

  revalidateChargeSurfaces()
  for (const chargeId of result.settledChargeIds) revalidatePath(`/charges/${chargeId}`)

  // Nothing was written, so there is nothing to confirm to the parent.
  if (result.settledChargeIds.length === 0) {
    return { error: t('updateStatusFailed') }
  }

  const notification = await resolveNotificationStatus(
    session.orgId,
    parsed.data.parentId,
    parsed.data.notifyParent
  )

  await afterManualPayment({
    orgId: session.orgId,
    parentId: parsed.data.parentId,
    chargeIds: result.settledChargeIds,
    closedChargeIds: result.settledChargeIds,
    amount: result.total,
    // Whatever failed is still owed, but it is an error state, not a balance to
    // quote back to the parent — the tutor sees it in the toast instead.
    remaining: 0,
    notifyParent: notification === 'queued',
  })

  return {
    error: null,
    notification,
    settled: result.settledChargeIds.length,
    failed: result.failedChargeIds.length,
  }
}

// ─── Settle a hand-picked set of charges ───────────────────────────────────

const settleChargesSchema = z.object({
  chargeIds: z.array(z.string().uuid()).min(1).max(200),
  method: paymentMethodSchema,
  notes: z.string().max(500).optional(),
  /** Omitted means "fall back to the org default" — see resolveNotificationStatus. */
  notifyParent: z.boolean().optional(),
})

export interface SettleChargesActionResult {
  error: string | null
  /** Charges closed. */
  settled?: number
  /** Charges that stayed open because their payment could not be written. */
  failed?: number
  /** How many parents fall into each notification outcome — for the toast. */
  notifications?: Record<PaymentNotificationStatus, number>
}

/**
 * Marks the charges the tutor ticked as paid — the middle ground between one
 * charge and a parent's whole balance, for the parent who paid for three of
 * this month's five lessons.
 *
 * The selection may span parents; each one gets a single confirmation naming
 * what they paid now and what they still owe.
 */
export async function settleChargesAction(input: {
  chargeIds: string[]
  method: PaymentMethod
  notes?: string
  notifyParent?: boolean
}): Promise<SettleChargesActionResult> {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)
  const t = await getTranslations('charges.errors')

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const parsed = settleChargesSchema.safeParse(input)
  if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

  let result
  try {
    result = await settleCharges({
      chargeIds: parsed.data.chargeIds,
      organizationId: session.orgId,
      method: parsed.data.method,
      notes: parsed.data.notes ?? null,
      actorProfileId: session.profileId,
    })
  } catch (err) {
    console.error('[charges] settle charges failed', { count: input.chargeIds.length, err })
    return { error: t('updateStatusFailed') }
  }

  if (!result.ok) return { error: t('nothingOpen') }

  revalidateChargeSurfaces()
  for (const chargeId of result.settledChargeIds) revalidatePath(`/charges/${chargeId}`)

  if (result.settledChargeIds.length === 0) {
    return { error: t('updateStatusFailed') }
  }

  const notifications: Record<PaymentNotificationStatus, number> = {
    queued: 0,
    disabled: 0,
    no_phone: 0,
    whatsapp_not_connected: 0,
  }

  for (const parent of result.byParent) {
    const notification = await resolveNotificationStatus(
      session.orgId,
      parent.parentId,
      parsed.data.notifyParent
    )
    notifications[notification] += 1

    await afterManualPayment({
      orgId: session.orgId,
      parentId: parent.parentId,
      chargeIds: parent.chargeIds,
      closedChargeIds: parent.chargeIds,
      amount: parent.amount,
      remaining: parent.remaining,
      notifyParent: notification === 'queued',
    })
  }

  return {
    error: null,
    settled: result.settledChargeIds.length,
    failed: result.failedChargeIds.length,
    notifications,
  }
}

async function runResolve(
  resolve: () => Promise<ResolveChargeResult>,
  input: { chargeId: string; reason: string }
): Promise<{ error: string | null }> {
  const t = await getTranslations('charges.errors')

  const parsed = resolveChargeSchema.safeParse({
    chargeId: input.chargeId,
    reason: input.reason.trim(),
  })
  if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

  let result: ResolveChargeResult
  try {
    result = await resolve()
  } catch (err) {
    console.error('[charges] resolve failed', { chargeId: input.chargeId, err })
    return { error: t('updateStatusFailed') }
  }

  if (!result.ok) {
    switch (result.reason) {
      case 'not_found':
        return { error: await commonError('notFound') }
      case 'already_paid':
        return { error: t('chargeAlreadyPaid') }
      case 'already_resolved':
        return { error: t('chargeAlreadyResolved') }
      default:
        return { error: t('updateStatusFailed') }
    }
  }

  revalidateChargeSurfaces()
  revalidatePath(`/charges/${input.chargeId}`)
  return { error: null }
}

async function sendReceiptEmail(chargeId: string, orgId: string): Promise<void> {
  const db = createServiceRoleClient()

  const { data: charge } = await db
    .from('charges')
    .select('amount, receipt_url, parent_id, parents(email)')
    .eq('id', chargeId)
    .eq('organization_id', orgId)
    .single()

  if (!charge) return

  type ChargeRow = { amount: number; receipt_url: string | null; parent_id: string; parents: { email: string | null } | null }
  const c = charge as unknown as ChargeRow
  const parentEmail = c.parents?.email
  if (!parentEmail || !c.receipt_url) return

  const canSend = await shouldSendEmail(orgId, 'receipt', parentEmail)
  if (!canSend) return

  const { subject, html } = receiptEmail(
    { amount: String(c.amount), receiptUrl: c.receipt_url },
  )

  await sendEmail({ orgId, to: parentEmail, subject, html })
}
