'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
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
