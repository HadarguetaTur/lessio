'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { getSession, requireMutation } from '@/lib/auth/session'
import { assertOrgNotSaasReadOnly } from '@/lib/saas/featureGate'
import { markChargeAsPaid, ChargeAlreadyResolvedError } from '@/lib/charges'
import { waiveCharge, voidCharge, type ResolveChargeResult } from '@/lib/charges/resolve'
import { recordChargePayment, type PaymentMethod } from '@/lib/charges/payments'
import { issueReceiptForCharge } from '@/lib/receipts/issueReceiptForCharge'
import { sendEmail, shouldSendEmail } from '@/lib/email'
import { receiptEmail } from '@/lib/email/templates/receipt'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { notifyMultiple, getOwnerAndAdminProfileIds } from '@/lib/notifications'
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

export async function markAsPaid(
  chargeId: string,
  notes?: string
): Promise<{ error: string | null }> {
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  try {
    await markChargeAsPaid(chargeId, orgId, notes?.trim() || undefined, session.profileId)
    revalidateChargeSurfaces()
  } catch (err) {
    if (err instanceof ChargeAlreadyResolvedError) {
      return { error: t('charges.errors.chargeResolved') }
    }
    return { error: t('charges.errors.updateStatusFailed') }
  }

  // After the response — must not block or fail mark-paid, but must outlive the lambda.
  await runAfterResponse(
    Promise.all([
      issueReceiptForCharge(chargeId, orgId).catch((err) => {
        console.error('[charges] receipt issuance failed — charge already marked paid', {
          chargeId,
          orgId,
          err,
        })
      }),
      sendReceiptEmail(chargeId, orgId).catch((err) => {
        console.error('[charges] receipt email failed', { chargeId, orgId, err })
      }),
    ])
  )

  // Fire-and-forget: in-app notification for payment received (Sprint 25 Story 4)
  void (async () => {
    try {
      const recipients = await getOwnerAndAdminProfileIds(orgId)
      await notifyMultiple(
        orgId,
        recipients,
        'payment_received',
        t('charges.paymentReceivedNotification'),
        undefined,
        `/charges/${chargeId}`
      )
    } catch (err) {
      console.error('[charges] notification failed', { chargeId, err })
    }
  })()

  return { error: null }
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

const recordPaymentSchema = z.object({
  chargeId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  method: z.enum(['manual', 'cash', 'bank_transfer', 'provider', 'other']),
  notes: z.string().max(500).optional(),
})

/**
 * Records money received against a charge. A payment that covers the remaining
 * balance closes the charge (receipt included); anything less leaves the
 * remainder as open debt.
 */
export async function recordChargePaymentAction(input: {
  chargeId: string
  amount: number
  method: PaymentMethod
  notes?: string
}): Promise<{ error: string | null }> {
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

  // A charge that just closed gets the same receipt treatment as mark-as-paid.
  if (result.closed) {
    await runAfterResponse(
      Promise.all([
        issueReceiptForCharge(parsed.data.chargeId, session.orgId).catch((err) => {
          console.error('[charges] receipt issuance failed after final payment', {
            chargeId: parsed.data.chargeId,
            err,
          })
        }),
        sendReceiptEmail(parsed.data.chargeId, session.orgId).catch((err) => {
          console.error('[charges] receipt email failed', { chargeId: parsed.data.chargeId, err })
        }),
      ])
    )
  }

  return { error: null }
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
