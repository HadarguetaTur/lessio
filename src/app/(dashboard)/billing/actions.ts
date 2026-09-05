'use server'

import { revalidatePath } from 'next/cache'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { assertOrgNotSaasReadOnly } from '@/lib/saas/featureGate'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildMonthForAllStudents } from '@/lib/billing/monthly/buildMonthForAllStudents'
import { buildStudentMonth } from '@/lib/billing/monthly/buildStudentMonth'
import { syncMonthlyCharge } from '@/lib/billing/monthly/syncMonthlyCharge'
import { markChargeAsPaid, ChargeAlreadyResolvedError } from '@/lib/charges'
import { logChargeAudit } from '@/lib/charges/audit'
import { issueReceiptForCharge } from '@/lib/receipts/issueReceiptForCharge'
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from '@/lib/subscriptions'
import { decryptToken } from '@/lib/crypto'
import { getPaymentProvider } from '@/lib/payments/factory'
import { PaymentProviderNotConfiguredError } from '@/lib/payments'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { formatBillingMonth } from '@/lib/i18n/formatBillingMonth'
import { getT } from '@/lib/i18n/serverTranslator'
import { sendPaymentWithButton } from '@/lib/whatsapp/sendSmart'
import { formatBotMoney } from '@/lib/i18n/formatCurrency'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { prepareBusinessSend } from '@/lib/whatsapp/consent'
import { getTranslations } from 'next-intl/server'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import {
  assertMonthlyBillingHasNoIndividualChargeConflicts,
  MonthlyBillingConflictError,
} from '@/lib/billing/monthly/conflicts'

function revalidateBillingSurfaces(studentId?: string) {
  revalidatePath('/billing')
  revalidatePath('/charges')
  revalidatePath('/dashboard')
  revalidatePath('/reports/revenue')
  revalidatePath('/reports/debt')
  revalidatePath('/students')
  revalidatePath('/parents')

  if (studentId) {
    revalidatePath(`/billing/${studentId}`)
  }
}

// ─── Monthly billing actions ───────────────────────────────────────────────

export async function generateMonthlyBilling(billingMonth: string) {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)
  const t = await getTranslations()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission') }
  }

  const policy = await getOrgBillingPolicy(session.orgId)
  if (policy.billingMode !== 'monthly') {
    return { error: t('billing.errors.monthlyModeRequired') }
  }

  const supabase = createServiceRoleClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', session.orgId)
    .single()

  const timezone = org?.timezone ?? 'Asia/Jerusalem'

  try {
    const result = await buildMonthForAllStudents(
      session.orgId,
      billingMonth,
      timezone,
      policy.cycleStartDay,
      policy.dueDays
    )
    revalidateBillingSurfaces()
    return {
      error: null,
      success: result.success.length,
      errors: result.errors.length,
      skipped: result.skipped.length,
    }
  } catch {
    return { error: t('billing.errors.generateFailed') }
  }
}

export async function recalculateStudentBilling(
  studentId: string,
  billingMonth: string
) {
  const session = await getSession()
  requireMutation(session)
  const t = await getTranslations()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission') }
  }

  const policy = await getOrgBillingPolicy(session.orgId)
  if (policy.billingMode !== 'monthly') {
    return { error: t('billing.errors.monthlyModeRequired') }
  }

  const supabase = createServiceRoleClient()
  const { data: existingBilling } = await supabase
    .from('student_monthly_billing')
    .select('is_approved, is_paid')
    .eq('organization_id', session.orgId)
    .eq('student_id', studentId)
    .eq('billing_month', billingMonth)
    .maybeSingle()
  if (existingBilling?.is_approved || existingBilling?.is_paid) {
    return { error: t('billing.errors.approvedRecalculationBlocked') }
  }
  const { data: org } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', session.orgId)
    .single()

  const timezone = org?.timezone ?? 'Asia/Jerusalem'

  try {
    await buildStudentMonth(
      session.orgId,
      studentId,
      billingMonth,
      timezone,
      undefined,
      policy.cycleStartDay,
      policy.dueDays
    )
    revalidateBillingSurfaces(studentId)
    return { error: null }
  } catch {
    return { error: t('billing.errors.recalculateFailed') }
  }
}

export async function markBillingAsPaid(billingId: string) {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)
  const t = await getTranslations()

  if (session.role !== 'owner') {
    return { error: t('billing.errors.markPaidOwnerOnly') }
  }

  const supabase = createServiceRoleClient()

  const { data: billing, error: billingError } = await supabase
    .from('student_monthly_billing')
    .select('id, student_id, parent_id, billing_month, total_amount, is_paid, is_approved, updated_at')
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .single()

  if (billingError || !billing) return { error: t('billing.errors.loadBillingFailed') }

  const { data: existingCharge, error: chargeError } = await supabase
    .from('charges')
    .select('id')
    .eq('organization_id', session.orgId)
    .eq('billing_record_id', billingId)
    .maybeSingle()

  if (chargeError) return { error: t('billing.errors.loadLedgerChargeFailed') }

  let chargeId = existingCharge?.id as string | undefined
  if (!chargeId) {
    try {
      const syncResult = await syncMonthlyCharge({
        organizationId: session.orgId,
        billingRecordId: billing.id as string,
        parentId: (billing.parent_id as string | null) ?? null,
        billingMonth: billing.billing_month as string,
        amount: Number(billing.total_amount),
        isApproved: Boolean(billing.is_approved),
        isPaid: Boolean(billing.is_paid),
        paidAtHint: (billing.updated_at as string | null) ?? null,
      })
      chargeId = syncResult.chargeId ?? undefined
    } catch {
      return { error: t('billing.errors.ledgerSyncFailed') }
    }
  }

  if (!chargeId) {
    return { error: t('billing.errors.markPaidTooEarly') }
  }

  try {
    await markChargeAsPaid(chargeId, session.orgId, undefined, session.profileId)
  } catch (err) {
    if (err instanceof ChargeAlreadyResolvedError) {
      return { error: t('charges.errors.chargeResolved') }
    }
    return { error: t('billing.errors.updatePaymentStatusFailed') }
  }

  revalidateBillingSurfaces(billing.student_id as string)

  await runAfterResponse(
    issueReceiptForCharge(chargeId, session.orgId).catch((err) => {
      console.error('[billing] receipt issuance failed after mark paid', {
        billingId,
        chargeId,
        orgId: session.orgId,
        err,
      })
    })
  )

  return { error: null }
}

const manualAdjustmentSchema = z.object({
  billingId: z.string().uuid(),
  amount: z.number(),
  reason: z.string().min(1).max(500),
})

export async function setManualAdjustment(
  billingId: string,
  amount: number,
  reason: string
) {
  const session = await getSession()
  requireMutation(session)
  const t = await getTranslations()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission') }
  }

  const parsed = manualAdjustmentSchema.safeParse({ billingId, amount, reason })
  if (!parsed.success) return { error: t('common.errors.invalidData') }

  const supabase = createServiceRoleClient()

  // Fetch current billing to recalculate total
  const { data: billing } = await supabase
    .from('student_monthly_billing')
    .select('id, student_id, parent_id, billing_month, is_paid, is_approved, lessons_amount, subscriptions_amount, cancellations_amount, total_amount, manual_adjustment_amount')
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .single()

  if (!billing) return { error: t('billing.errors.billingNotFound') }

  const computedTotal =
    Number(billing.lessons_amount) +
    Number(billing.subscriptions_amount) +
    Number(billing.cancellations_amount)
  const totalAmount = Math.round((computedTotal + amount) * 100) / 100

  const { data: updatedBilling, error } = await supabase
    .from('student_monthly_billing')
    .update({
      manual_adjustment_amount: amount,
      manual_adjustment_reason: reason,
      manual_adjustment_date: new Date().toISOString().slice(0, 10),
      total_amount: totalAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .select('id, student_id, parent_id, billing_month, total_amount, is_paid, is_approved, updated_at')
    .single()

  if (error) return { error: t('billing.errors.updateAdjustmentFailed') }

  let syncResult
  try {
    syncResult = await syncMonthlyCharge({
      organizationId: session.orgId,
      billingRecordId: updatedBilling.id as string,
      parentId: (updatedBilling.parent_id as string | null) ?? null,
      billingMonth: updatedBilling.billing_month as string,
      amount: Number(updatedBilling.total_amount),
      isApproved: Boolean(updatedBilling.is_approved),
      isPaid: Boolean(updatedBilling.is_paid),
      paidAtHint: (updatedBilling.updated_at as string | null) ?? null,
    })
  } catch {
    return { error: t('billing.errors.adjustmentSavedLedgerFailed') }
  }

  // student_monthly_billing keeps only the latest adjustment, so the audit log
  // is the only place the previous one survives.
  if (syncResult.chargeId) {
    await logChargeAudit({
      organizationId: session.orgId,
      chargeId: syncResult.chargeId,
      parentId: (updatedBilling.parent_id as string | null) ?? null,
      eventType: 'amount_adjusted',
      actorProfileId: session.profileId,
      beforeAmount: Number(billing.total_amount),
      afterAmount: Number(updatedBilling.total_amount),
      reason,
      metadata: {
        previous_adjustment: Number(billing.manual_adjustment_amount ?? 0),
        adjustment: amount,
      },
    })
  }

  revalidateBillingSurfaces(updatedBilling.student_id as string)
  return { error: null }
}

// ─── Cancellation event actions ────────────────────────────────────────────

export async function confirmCancellationCharge(
  eventId: string,
  isCharged: boolean,
  chargeOverride?: number
) {
  const session = await getSession()
  requireMutation(session)
  const t = await getTranslations()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission') }
  }

  const supabase = createServiceRoleClient()

  const payload: Record<string, unknown> = { is_charged: isCharged }
  if (chargeOverride !== undefined) {
    payload.charge_override = chargeOverride
  }

  const { error } = await supabase
    .from('student_cancellation_events')
    .update(payload)
    .eq('id', eventId)
    .eq('organization_id', session.orgId)

  if (error) return { error: t('billing.errors.updateCancellationEventFailed') }

  revalidatePath('/billing')
  return { error: null }
}

// ─── Subscription actions ──────────────────────────────────────────────────

const createSubscriptionSchema = z.object({
  student_id: z.string().uuid(),
  subscription_type: z.string().max(100).optional().nullable(),
  monthly_amount: z.number().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
})

export async function createSubscriptionAction(formData: {
  student_id: string
  subscription_type?: string | null
  monthly_amount: number
  start_date: string
  end_date?: string | null
}) {
  const session = await getSession()
  requireMutation(session)
  const t = await getTranslations()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission') }
  }

  const parsed = createSubscriptionSchema.safeParse(formData)
  if (!parsed.success) return { error: t('common.errors.invalidData') }

  try {
    await createSubscription({
      organization_id: session.orgId,
      ...parsed.data,
    })
    revalidatePath('/students')
    revalidatePath('/billing')
    return { error: null }
  } catch {
    return { error: t('billing.errors.createSubscriptionFailed') }
  }
}

const updateSubscriptionSchema = z.object({
  subscription_type: z.string().max(100).optional().nullable(),
  monthly_amount: z.number().positive().optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  is_paused: z.boolean().optional(),
})

export async function updateSubscriptionAction(
  id: string,
  data: {
    subscription_type?: string | null
    monthly_amount?: number
    start_date?: string
    end_date?: string | null
    is_paused?: boolean
  }
) {
  const session = await getSession()
  requireMutation(session)
  const t = await getTranslations()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission') }
  }

  const parsed = updateSubscriptionSchema.safeParse(data)
  if (!parsed.success) return { error: t('common.errors.invalidData') }

  try {
    await updateSubscription(id, session.orgId, parsed.data)
    revalidatePath('/students')
    revalidatePath('/billing')
    return { error: null }
  } catch {
    return { error: t('billing.errors.updateSubscriptionFailed') }
  }
}

export async function deleteSubscriptionAction(id: string) {
  const session = await getSession()
  requireMutation(session)
  const t = await getTranslations()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission') }
  }

  try {
    await deleteSubscription(id, session.orgId)
    revalidatePath('/students')
    revalidatePath('/billing')
    return { error: null }
  } catch {
    return { error: t('billing.errors.deleteSubscriptionFailed') }
  }
}

// ─── Billing approval actions ──────────────────────────────────────────────

export async function approveBillingAction(billingId: string) {
  const session = await getSession()
  requireMutation(session)
  const t = await getTranslations()
  await assertOrgNotSaasReadOnly(session.orgId)

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission') }
  }

  const supabase = createServiceRoleClient()

  const { data: billing } = await supabase
    .from('student_monthly_billing')
    .select('id, student_id, parent_id, billing_month, period_end, total_amount, is_paid, is_approved')
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .single()

  if (!billing) return { error: t('billing.errors.billingNotFound') }
  if (billing.is_paid) return { error: t('billing.errors.alreadyPaid') }
  if (billing.is_approved) return { error: null } // idempotent

  const policy = await getOrgBillingPolicy(session.orgId)
  if (policy.billingMode !== 'monthly') {
    return { error: t('billing.errors.monthlyModeRequired') }
  }
  try {
    await assertMonthlyBillingHasNoIndividualChargeConflicts(session.orgId, billingId)
  } catch (error) {
    if (error instanceof MonthlyBillingConflictError) {
      return { error: t('billing.errors.individualChargeConflict') }
    }
    return { error: t('billing.errors.approvedLedgerFailed') }
  }

  const { error: updateError } = await supabase
    .from('student_monthly_billing')
    .update({ is_approved: true, updated_at: new Date().toISOString() })
    .eq('id', billingId)
    .eq('organization_id', session.orgId)

  if (updateError) return { error: t('billing.errors.approveFailed') }

  let chargeId: string | null = null
  try {
    const syncResult = await syncMonthlyCharge({
      organizationId: session.orgId,
      billingRecordId: billing.id as string,
      parentId: (billing.parent_id as string | null) ?? null,
      billingMonth: billing.billing_month as string,
      amount: Number(billing.total_amount),
      isApproved: true,
      isPaid: false,
      periodEnd: billing.period_end as string,
      dueDays: policy.dueDays,
    })
    chargeId = syncResult.chargeId
  } catch (error) {
    await supabase
      .from('student_monthly_billing')
      .update({ is_approved: false, updated_at: new Date().toISOString() })
      .eq('id', billingId)
      .eq('organization_id', session.orgId)
    if (error instanceof MonthlyBillingConflictError) {
      return { error: t('billing.errors.individualChargeConflict') }
    }
    return { error: t('billing.errors.approvedLedgerFailed') }
  }

  // No document is issued here. Tax documents come only from external licensed
  // receipt providers (decision: Lessio is not an invoicing system) — the
  // internal PDF generator that used to fire from this point was removed.
  revalidateBillingSurfaces(billing.student_id as string)

  // Fire-and-forget: send payment request if enabled and charge was created
  if (chargeId && billing.parent_id) {
    sendBillingPaymentRequestCore(billingId, session.orgId).catch((err) => {
      console.error('[billing] auto payment request failed after approve', {
        billingId,
        orgId: session.orgId,
        err,
      })
    })
  }

  return { error: null }
}

export type SendPaymentRequestResult = {
  error: string | null
  /**
   * What actually happened. The button must not render "sent ✓" for anything
   * but 'sent': the org with no payment provider and no WhatsApp is the common
   * case, and reporting success there is the product lying about money.
   */
  outcome: SendPaymentRequestOutcome | null
}

export async function sendBillingPaymentRequestAction(
  billingId: string
): Promise<SendPaymentRequestResult> {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)
  const t = await getTranslations()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: t('common.errors.noPermission'), outcome: null }
  }

  try {
    const outcome = await sendBillingPaymentRequestCore(billingId, session.orgId)
    if (outcome === 'opted_out') {
      return { error: t('parents.optedOutError'), outcome }
    }
    return { error: null, outcome }
  } catch (err) {
    console.error('[billing] sendBillingPaymentRequestAction failed', { billingId, orgId: session.orgId, err })
    // A missing WhatsApp connection is a specific, fixable cause with its own
    // message — don't flatten it into the generic failure.
    const message =
      err instanceof WhatsAppNotConnectedError
        ? t('common.errors.whatsappNotConnected')
        : t('billing.errors.sendPaymentRequestFailed')
    return { error: message, outcome: null }
  }
}

/** Raised when the org has no usable WhatsApp connection, so callers can tell
 *  that specific cause apart from a genuine send failure. */
class WhatsAppNotConnectedError extends Error {}

export type SendPaymentRequestOutcome = 'sent' | 'opted_out' | 'no_provider'

/**
 * Shared core: creates payment link + sends WhatsApp for a monthly billing record.
 * Throws on failure — callers decide whether to fire-and-forget or surface the error.
 *
 * Returns why nothing was sent when that is a normal outcome rather than a
 * failure, so the button can say "this parent opted out" instead of a generic error.
 */
async function sendBillingPaymentRequestCore(
  billingId: string,
  orgId: string
): Promise<SendPaymentRequestOutcome> {
  const db = createServiceRoleClient()
  // Failures here surface to the acting dashboard user, so they use the viewer's
  // locale. The parent-facing copy below uses `tr` (the recipient's locale).
  const t = await getTranslations()

  // Load org settings
  const { data: org } = await db
    .from('organizations')
    .select('auto_send_payment_request, payment_provider, whatsapp_phone_number_id, whatsapp_access_token, default_locale, currency')
    .eq('id', orgId)
    .single()

  if (!org?.auto_send_payment_request && !org?.payment_provider) {
    // Nothing to send with. Silent when called from the approve fire-and-forget
    // path; the button reports it, because "nothing happened" is not "sent".
    return 'no_provider'
  }

  const encryptedToken = org.whatsapp_access_token as string | null
  const phoneNumberId = org.whatsapp_phone_number_id as string | null
  const currency = (org.currency as string | null) ?? undefined

  if (!encryptedToken || !phoneNumberId) {
    throw new WhatsAppNotConnectedError(t('common.errors.whatsappNotConnected'))
  }

  // Load billing + linked charge
  const { data: billing } = await db
    .from('student_monthly_billing')
    .select('id, parent_id, billing_month, period_start, period_end, total_amount, student_id')
    .eq('id', billingId)
    .eq('organization_id', orgId)
    .single()

  if (!billing) throw new Error(t('billing.errors.billingNotFound'))
  if (!billing.parent_id) throw new Error(t('billing.errors.noParentLinked'))

  const { data: charge } = await db
    .from('charges')
    .select('id, status, amount')
    .eq('organization_id', orgId)
    .eq('billing_record_id', billingId)
    .maybeSingle()

  if (!charge) throw new Error(t('billing.errors.ledgerChargeNotFound'))
  if (charge.status === 'paid') throw new Error(t('billing.errors.chargeAlreadyPaid'))

  // Load parent
  const { data: parent } = await db
    .from('parents')
    .select('id, full_name, phone, preferred_locale')
    .eq('id', billing.parent_id)
    .eq('organization_id', orgId)
    .single()

  if (!parent?.phone) throw new Error(t('billing.errors.parentMissingPhone'))

  const locale = resolveRecipientLocale({
    stored: parent.preferred_locale as string | null,
    orgDefault: org.default_locale as string | null,
  })

  // Business-initiated. sendPaymentWithButton runs this gate too, but it is checked
  // here first, before the payment link is created — creating one nobody will
  // be sent is waste. The second pass is a no-op (welcome already claimed).
  const accessToken = decryptToken(encryptedToken)
  const gate = await prepareBusinessSend({ orgId, phone: parent.phone as string, accessToken, phoneNumberId, locale })
  if (!gate.ok) {
    console.info('[billing] payment request skipped — parent opted out', { billingId, orgId })
    return 'opted_out'
  }
  // Everything below is read by the parent, not by whoever clicked Send.
  const tr = await getT('billing', locale)
  const monthLabel = billing.period_start && billing.period_end
    ? `${billing.period_start}–${billing.period_end}`
    : formatBillingMonth(billing.billing_month as string, locale)

  // Create payment link. DEMO_PAYMENT_LINK_ENABLED=1 allows sending without a
  // configured payment provider by linking to the org's parent portal instead
  // (Meta App Review demo — dead branch in normal production operation).
  let paymentResult: { url: string; reference: string }
  let providerName: string
  try {
    const p = await getPaymentProvider(orgId)
    providerName = p.providerName
    paymentResult = await p.provider.createPaymentLink({
      chargeId: charge.id,
      amount: Number(charge.amount),
      description: tr('paymentDescription', { month: monthLabel, parent: parent.full_name as string }),
      orgId,
      payer: { fullName: parent.full_name as string, phone: parent.phone as string },
    })
  } catch (err) {
    if (
      process.env.DEMO_PAYMENT_LINK_ENABLED === '1' &&
      err instanceof PaymentProviderNotConfiguredError
    ) {
      providerName = 'demo'
      paymentResult = {
        url: `${getShareableBaseUrl()}/portal/${orgId}`,
        reference: `demo-${charge.id}`,
      }
    } else {
      throw err
    }
  }

  // Persist link on charge
  await db
    .from('charges')
    .update({
      payment_link: paymentResult.url,
      payment_reference: paymentResult.reference,
      payment_provider: providerName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', charge.id)
    .eq('organization_id', orgId)

  // Session-window aware: the org's own template copy inside the 24h window,
  // the Meta-approved lessio_payment_request_* template outside it. A plain
  // text send here failed with error 131047 for every parent who had not
  // written to the business in the last day. The monthly bill is one charge,
  // so there is nothing to itemise.
  await sendPaymentWithButton({
    orgId,
    phone: parent.phone as string,
    accessToken,
    phoneNumberId,
    templateType: 'payment_request',
    vars: {
      parent_name: parent.full_name as string,
      amount: formatBotMoney(Number(charge.amount), locale, currency),
      amount_value: Number(charge.amount).toFixed(2),
      description: tr('paymentDescriptionShort', { month: monthLabel }),
      charge_lines: '',
      payment_link: paymentResult.url,
    },
    chargeId: charge.id,
    paymentUrl: paymentResult.url,
    locale,
  })

  // Log sent_at
  await db
    .from('charges')
    .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', charge.id)
    .eq('organization_id', orgId)

  console.info('[billing] payment request sent', { billingId, orgId, chargeId: charge.id, providerName })
  return 'sent'
}
