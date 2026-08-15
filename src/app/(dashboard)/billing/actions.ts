'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { assertOrgNotSaasReadOnly } from '@/lib/saas/featureGate'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildMonthForAllStudents } from '@/lib/billing/monthly/buildMonthForAllStudents'
import { buildStudentMonth } from '@/lib/billing/monthly/buildStudentMonth'
import { syncMonthlyCharge } from '@/lib/billing/monthly/syncMonthlyCharge'
import { markChargeAsPaid } from '@/lib/charges'
import { issueReceiptForCharge } from '@/lib/receipts/issueReceiptForCharge'
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from '@/lib/subscriptions'
import { decryptToken } from '@/lib/crypto'
import { getPaymentProvider } from '@/lib/payments/factory'
import { PaymentProviderNotConfiguredError } from '@/lib/payments'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { sendTextMessage } from '@/lib/whatsapp'
import { generateAndStoreInvoice } from '@/lib/billing/invoices/generateInvoicePdf'
import { generateAndStoreCreditNote } from '@/lib/billing/invoices/generateCreditNotePdf'
import { getInvoiceSignedUrl } from '@/lib/billing/invoices/uploadInvoicePdf'
import { createNotification } from '@/lib/notifications'

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

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
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
      timezone
    )
    revalidateBillingSurfaces()
    return {
      error: null,
      success: result.success.length,
      errors: result.errors.length,
      skipped: result.skipped.length,
    }
  } catch {
    return { error: 'שגיאה ביצירת החיובים החודשיים' }
  }
}

export async function recalculateStudentBilling(
  studentId: string,
  billingMonth: string
) {
  const session = await getSession()
  requireMutation(session)

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const supabase = createServiceRoleClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', session.orgId)
    .single()

  const timezone = org?.timezone ?? 'Asia/Jerusalem'

  try {
    await buildStudentMonth(session.orgId, studentId, billingMonth, timezone)
    revalidateBillingSurfaces(studentId)
    return { error: null }
  } catch {
    return { error: 'שגיאה בחישוב מחדש' }
  }
}

export async function markBillingAsPaid(billingId: string) {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)

  if (session.role !== 'owner') {
    return { error: 'רק בעלים יכול לסמן כשולם' }
  }

  const supabase = createServiceRoleClient()

  const { data: billing, error: billingError } = await supabase
    .from('student_monthly_billing')
    .select('id, student_id, parent_id, billing_month, total_amount, is_paid, is_approved, updated_at')
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .single()

  if (billingError || !billing) return { error: 'שגיאה בטעינת החיוב החודשי' }

  const { data: existingCharge, error: chargeError } = await supabase
    .from('charges')
    .select('id')
    .eq('organization_id', session.orgId)
    .eq('billing_record_id', billingId)
    .maybeSingle()

  if (chargeError) return { error: 'שגיאה בטעינת חיוב ledger' }

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
      return { error: 'שגיאה בסנכרון החיוב ל-ledger' }
    }
  }

  if (!chargeId) {
    return { error: 'לא ניתן לסמן כשולם לפני שיוך הורה ואישור החיוב' }
  }

  try {
    await markChargeAsPaid(chargeId, session.orgId)
  } catch {
    return { error: 'שגיאה בעדכון סטטוס התשלום' }
  }

  revalidateBillingSurfaces(billing.student_id as string)

  issueReceiptForCharge(chargeId, session.orgId).catch((err) => {
    console.error('[billing] receipt issuance failed after mark paid', {
      billingId,
      chargeId,
      orgId: session.orgId,
      err,
    })
  })

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

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const parsed = manualAdjustmentSchema.safeParse({ billingId, amount, reason })
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  const supabase = createServiceRoleClient()

  // Fetch current billing to recalculate total
  const { data: billing } = await supabase
    .from('student_monthly_billing')
    .select('id, student_id, parent_id, billing_month, is_paid, is_approved, lessons_amount, subscriptions_amount, cancellations_amount')
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .single()

  if (!billing) return { error: 'רשומת חיוב לא נמצאה' }

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

  if (error) return { error: 'שגיאה בעדכון התאמה ידנית' }

  try {
    await syncMonthlyCharge({
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
    return { error: 'ההתאמה נשמרה אך סנכרון ledger נכשל' }
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

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
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

  if (error) return { error: 'שגיאה בעדכון אירוע הביטול' }

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

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const parsed = createSubscriptionSchema.safeParse(formData)
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  try {
    await createSubscription({
      organization_id: session.orgId,
      ...parsed.data,
    })
    revalidatePath('/students')
    revalidatePath('/billing')
    return { error: null }
  } catch {
    return { error: 'שגיאה ביצירת המנוי' }
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

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const parsed = updateSubscriptionSchema.safeParse(data)
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  try {
    await updateSubscription(id, session.orgId, parsed.data)
    revalidatePath('/students')
    revalidatePath('/billing')
    return { error: null }
  } catch {
    return { error: 'שגיאה בעדכון המנוי' }
  }
}

export async function deleteSubscriptionAction(id: string) {
  const session = await getSession()
  requireMutation(session)

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  try {
    await deleteSubscription(id, session.orgId)
    revalidatePath('/students')
    revalidatePath('/billing')
    return { error: null }
  } catch {
    return { error: 'שגיאה במחיקת המנוי' }
  }
}

// ─── Billing approval actions ──────────────────────────────────────────────

export async function approveBillingAction(billingId: string) {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const supabase = createServiceRoleClient()

  const { data: billing } = await supabase
    .from('student_monthly_billing')
    .select('id, student_id, parent_id, billing_month, total_amount, is_paid, is_approved')
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .single()

  if (!billing) return { error: 'רשומת חיוב לא נמצאה' }
  if (billing.is_paid) return { error: 'החיוב כבר סומן כשולם' }
  if (billing.is_approved) return { error: null } // idempotent

  const { error: updateError } = await supabase
    .from('student_monthly_billing')
    .update({ is_approved: true, updated_at: new Date().toISOString() })
    .eq('id', billingId)
    .eq('organization_id', session.orgId)

  if (updateError) return { error: 'שגיאה בעדכון אישור החיוב' }

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
    })
    chargeId = syncResult.chargeId
  } catch {
    return { error: 'החיוב אושר אך סנכרון ledger נכשל' }
  }

  // Fire-and-forget: generate PDF invoice
  generateAndStoreInvoice(billingId, session.orgId).catch((err) => {
    console.error('[billing] invoice generation failed after approve', {
      billingId, orgId: session.orgId, err,
    })
  })

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

export async function sendBillingPaymentRequestAction(billingId: string) {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  try {
    await sendBillingPaymentRequestCore(billingId, session.orgId)
    return { error: null }
  } catch (err) {
    console.error('[billing] sendBillingPaymentRequestAction failed', { billingId, orgId: session.orgId, err })
    return { error: 'שגיאה בשליחת בקשת התשלום' }
  }
}

/**
 * Shared core: creates payment link + sends WhatsApp for a monthly billing record.
 * Throws on failure — callers decide whether to fire-and-forget or surface the error.
 */
async function sendBillingPaymentRequestCore(
  billingId: string,
  orgId: string
): Promise<void> {
  const db = createServiceRoleClient()

  // Load org settings
  const { data: org } = await db
    .from('organizations')
    .select('auto_send_payment_request, payment_provider, whatsapp_phone_number_id, whatsapp_access_token, timezone')
    .eq('id', orgId)
    .single()

  if (!org?.auto_send_payment_request && !org?.payment_provider) {
    // Called from approve fire-and-forget: skip silently
    return
  }

  const encryptedToken = org.whatsapp_access_token as string | null
  const phoneNumberId = org.whatsapp_phone_number_id as string | null
  const timezone = (org.timezone as string | null) ?? 'Asia/Jerusalem'

  if (!encryptedToken || !phoneNumberId) {
    throw new Error('WhatsApp לא מחובר')
  }

  // Load billing + linked charge
  const { data: billing } = await db
    .from('student_monthly_billing')
    .select('id, parent_id, billing_month, total_amount, student_id')
    .eq('id', billingId)
    .eq('organization_id', orgId)
    .single()

  if (!billing) throw new Error('רשומת חיוב לא נמצאה')
  if (!billing.parent_id) throw new Error('לא שויך הורה לחיוב זה')

  const { data: charge } = await db
    .from('charges')
    .select('id, status, amount')
    .eq('organization_id', orgId)
    .eq('billing_record_id', billingId)
    .maybeSingle()

  if (!charge) throw new Error('חיוב ב-ledger לא נמצא — יש לאשר תחילה')
  if (charge.status === 'paid') throw new Error('החיוב כבר שולם')

  // Load parent
  const { data: parent } = await db
    .from('parents')
    .select('id, full_name, phone')
    .eq('id', billing.parent_id)
    .eq('organization_id', orgId)
    .single()

  if (!parent?.phone) throw new Error('הורה לא נמצא או חסר מספר טלפון')

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
      description: `חיוב חודשי ${billing.billing_month} — ${parent.full_name}`,
      orgId,
    })
  } catch (err) {
    if (
      process.env.DEMO_PAYMENT_LINK_ENABLED === '1' &&
      err instanceof PaymentProviderNotConfiguredError
    ) {
      providerName = 'demo'
      paymentResult = {
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/portal/${orgId}`,
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

  // Build and send WhatsApp message via template
  const accessToken = decryptToken(encryptedToken)
  const body = await resolveTemplate(orgId, 'payment_request', {
    amount: Number(charge.amount).toFixed(2),
    description: `חיוב חודשי ${billing.billing_month}`,
    payment_link: paymentResult.url,
  })

  await sendTextMessage(parent.phone, body, accessToken, phoneNumberId)

  // Log sent_at
  await db
    .from('charges')
    .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', charge.id)
    .eq('organization_id', orgId)

  console.info('[billing] payment request sent', { billingId, orgId, chargeId: charge.id, providerName })
}

// ─── Invoice actions ────────────────────────────────────────────────────────

export async function downloadInvoiceAction(billingId: string) {
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה', url: null }
  }

  const supabase = createServiceRoleClient()
  const { data: billing } = await supabase
    .from('student_monthly_billing')
    .select('invoice_pdf_url')
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .single()

  if (!billing?.invoice_pdf_url) {
    return { error: 'לא נמצאה חשבונית', url: null }
  }

  try {
    const url = await getInvoiceSignedUrl(billing.invoice_pdf_url as string)
    return { error: null, url }
  } catch {
    return { error: 'שגיאה ביצירת קישור הורדה', url: null }
  }
}

export async function issueCreditNoteAction(billingId: string, reason: string) {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  if (!reason || reason.trim().length === 0) {
    return { error: 'יש לציין סיבה לביטול החשבונית' }
  }

  const supabase = createServiceRoleClient()
  const { data: billing } = await supabase
    .from('student_monthly_billing')
    .select('id, invoice_number, credit_note_number, student_id, parent_id')
    .eq('id', billingId)
    .eq('organization_id', session.orgId)
    .single()

  if (!billing) return { error: 'רשומת חיוב לא נמצאה' }
  if (!billing.invoice_number) return { error: 'לא ניתן לבטל — אין חשבונית' }
  if (billing.credit_note_number) return { error: 'חשבונית זיכוי כבר הונפקה' }

  try {
    await generateAndStoreCreditNote(billingId, session.orgId, reason.trim())
  } catch (err) {
    console.error('[billing] credit note generation failed', { billingId, orgId: session.orgId, err })
    return { error: 'שגיאה ביצירת חשבונית זיכוי' }
  }

  // Notify parent
  if (billing.parent_id) {
    const { data: ownerProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', session.orgId)
      .eq('role', 'owner')
      .limit(1)

    const recipientId = ownerProfiles?.[0]?.id
    if (recipientId) {
      createNotification({
        orgId: session.orgId,
        recipientProfileId: recipientId,
        type: 'invoice_cancelled',
        title: 'חשבונית זיכוי הונפקה',
        body: reason.trim(),
        actionUrl: `/billing/${billing.student_id}`,
      }).catch(() => {})
    }
  }

  revalidateBillingSurfaces(billing.student_id as string)
  return { error: null }
}
