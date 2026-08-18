'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { markChargeAsPaid } from '@/lib/charges'
import { issueReceiptForCharge } from '@/lib/receipts/issueReceiptForCharge'
import { sendEmail, shouldSendEmail } from '@/lib/email'
import { receiptEmail } from '@/lib/email/templates/receipt'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { notifyMultiple, getOwnerAndAdminProfileIds } from '@/lib/notifications'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

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
    await markChargeAsPaid(chargeId, orgId, notes?.trim() || undefined)
    revalidatePath('/charges')
    revalidatePath('/parents')
  } catch {
    return { error: t('charges.errors.updateStatusFailed') }
  }

  // Fire-and-forget receipt issuance — must not block or fail the mark-paid response
  issueReceiptForCharge(chargeId, orgId).catch((err) => {
    console.error('[charges] receipt issuance failed — charge already marked paid', {
      chargeId,
      orgId,
      err,
    })
  })

  // Fire-and-forget email receipt notification
  sendReceiptEmail(chargeId, orgId).catch((err) => {
    console.error('[charges] receipt email failed', { chargeId, orgId, err })
  })

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
