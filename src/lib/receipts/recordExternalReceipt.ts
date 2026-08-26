/**
 * Records a tax document that the PAYMENT PROVIDER issued, and sends it on.
 *
 * The counterpart to issueReceiptForCharge: there, Lessio calls an invoicing
 * service and gets a document back; here, the provider issued one on its own at
 * charge time and told us over a webhook. Either way the parent ends up with
 * the same WhatsApp message and the charge ends up carrying receipt_url.
 *
 * receipt_mode does not gate the recording — the document exists either way and
 * belongs on the charge. It does gate the message: an org that said it does not
 * do invoicing through Lessio has opted out of Lessio sending invoices to its
 * parents, and a provider webhook is not consent to start.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { notifyParentOfReceipt } from './notifyParentOfReceipt'
import type { ReceiptMode } from './index'

export async function recordExternalReceipt(params: {
  chargeId: string
  orgId: string
  receiptUrl: string
  /** Provider's own document number, logged for reconciliation. */
  documentNumber?: string | null
}): Promise<boolean> {
  const { chargeId, orgId, receiptUrl, documentNumber } = params
  const db = createServiceRoleClient()

  const { data: charge, error: chargeError } = await db
    .from('charges')
    .select(
      'id, amount, receipt_issued_at, parents(full_name, phone, preferred_locale), organizations(whatsapp_phone_number_id, whatsapp_access_token, default_locale, receipt_mode)'
    )
    .eq('id', chargeId)
    .eq('organization_id', orgId)
    .single()

  if (chargeError || !charge) {
    console.error('[receipts] Failed to load charge for external document', {
      chargeId,
      orgId,
      error: chargeError?.message,
    })
    return false
  }

  if (charge.receipt_issued_at) {
    console.debug('[receipts] Document already recorded — skipping', { chargeId, orgId })
    return false
  }

  // The `.is(null)` filter is the idempotency guard: a redelivered webhook
  // updates zero rows and therefore sends no second message.
  const { data: updatedRows, error: updateError } = await db
    .from('charges')
    .update({
      receipt_url: receiptUrl,
      receipt_issued_at: new Date().toISOString(),
    })
    .eq('id', chargeId)
    .is('receipt_issued_at', null)
    .select('id')

  if (updateError) {
    console.error('[receipts] Failed to record external document', {
      chargeId,
      orgId,
      error: updateError.message,
    })
    return false
  }

  if (!updatedRows?.length) {
    console.warn('[receipts] External document matched no row — concurrent delivery', {
      chargeId,
      orgId,
    })
    return false
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parent = (charge as any).parents as {
    full_name: string
    phone: string | null
    preferred_locale: string | null
  } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const org = (charge as any).organizations as {
    whatsapp_phone_number_id: string | null
    whatsapp_access_token: string | null
    default_locale: string | null
    receipt_mode: string | null
  } | null

  const receiptMode = (org?.receipt_mode ?? null) as ReceiptMode | null

  if (receiptMode === 'none') {
    console.info('[receipts] Document recorded but not sent — org invoices outside Lessio', {
      chargeId,
      orgId,
    })
  } else {
    await notifyParentOfReceipt({
      orgId,
      chargeId,
      amount: Number(charge.amount),
      receiptUrl,
      parentPhone: parent?.phone,
      parentLocale: parent?.preferred_locale,
      orgDefaultLocale: org?.default_locale,
      phoneNumberId: org?.whatsapp_phone_number_id,
      encryptedToken: org?.whatsapp_access_token,
    })
  }

  console.info('[receipts] Provider-issued document recorded', {
    chargeId,
    orgId,
    receiptUrl,
    documentNumber,
  })
  return true
}
