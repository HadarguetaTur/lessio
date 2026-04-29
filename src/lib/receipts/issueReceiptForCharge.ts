/**
 * Idempotent receipt issuance for a paid charge.
 * Per /docs/sprint-15-scope.md § Story 2.
 *
 * Steps:
 * 1. Load charge (with parent + org).
 * 2. Guard: if receipt_issued_at already set → return (already issued).
 * 3. Guard: if no receipt provider configured → return null silently.
 * 4. Call provider.issueReceipt(...).
 * 5. UPDATE charges SET receipt_url, receipt_issued_at WHERE receipt_issued_at IS NULL (atomic).
 * 6. Send WhatsApp to parent: best-effort, catch + log.
 * 7. Return receipt URL.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { getReceiptProvider } from './factory'
import { ReceiptProviderNotConfiguredError } from './index'
import { sendTextMessage } from '@/lib/whatsapp'
import { resolveTemplate } from '@/lib/whatsapp/templates'

/**
 * Issues a receipt for a paid charge and updates the charge row.
 *
 * @returns receipt URL on success, null if provider not configured or receipt already issued.
 * Receipt failure never rolls back a completed payment — always fire-and-forget from callers.
 */
export async function issueReceiptForCharge(
  chargeId: string,
  orgId: string
): Promise<string | null> {
  const db = createServiceRoleClient()

  // ── 1. Load charge with parent + org ───────────────────────────────────────
  const { data: charge, error: chargeError } = await db
    .from('charges')
    .select(
      'id, amount, charge_type, billing_month, notes, status, receipt_issued_at, parent_id, parents(full_name, phone, tax_id), organizations(name, timezone, whatsapp_phone_number_id, whatsapp_access_token, receipt_document_type, default_vat_rate)'
    )
    .eq('id', chargeId)
    .eq('organization_id', orgId)
    .single()

  if (chargeError || !charge) {
    console.error('[receipts] Failed to load charge', { chargeId, orgId, error: chargeError?.message })
    return null
  }

  if (charge.status !== 'paid') {
    console.debug('[receipts] Charge is not paid — skipping receipt', {
      chargeId,
      orgId,
      status: charge.status,
    })
    return null
  }

  // ── 2. Idempotency guard ───────────────────────────────────────────────────
  if (charge.receipt_issued_at) {
    console.debug('[receipts] Receipt already issued — skipping', { chargeId, orgId })
    return null
  }

  // ── 3. Load receipt provider ───────────────────────────────────────────────
  let provider: Awaited<ReturnType<typeof getReceiptProvider>>
  try {
    provider = await getReceiptProvider(orgId)
  } catch (err) {
    if (err instanceof ReceiptProviderNotConfiguredError) {
      console.debug('[receipts] No receipt provider configured — skipping', { orgId })
      return null
    }
    throw err
  }

  // ── 4. Issue receipt via provider ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parent = (charge as any).parents as { full_name: string; phone: string | null; tax_id: string | null } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const org = (charge as any).organizations as {
    name: string
    timezone: string | null
    whatsapp_phone_number_id: string | null
    whatsapp_access_token: string | null
    receipt_document_type: string | null
    default_vat_rate: number | null
  } | null

  const parentName = parent?.full_name ?? 'לקוח'
  const orgName = org?.name ?? ''
  const tz = org?.timezone ?? 'Asia/Jerusalem'
  const chargeType = charge.charge_type as string
  const billingMonth = (charge.billing_month as string | null) ?? null
  const today =
    DateTime.now().setZone(tz).toISODate() ??
    new Date().toISOString().slice(0, 10)

  const description =
    chargeType === 'monthly'
      ? ((charge.notes as string | null) ?? `חיוב חודשי ${billingMonth ?? ''}`).trim()
      : chargeType === 'cancellation'
        ? `תשלום ביטול — ${parentName}`
        : chargeType === 'manual'
          ? ((charge.notes as string | null) ?? `חיוב ידני — ${parentName}`).trim()
          : `תשלום שיעור — ${parentName}`

  const documentType = (org?.receipt_document_type === 'tax_invoice' ? 'tax_invoice' : 'receipt') as import('./index').DocumentType
  const vatRate = Number(org?.default_vat_rate ?? 0)
  const vatAmount = documentType === 'tax_invoice' ? Math.round(charge.amount * vatRate) / 100 : undefined
  const customerTaxId = parent?.tax_id ?? undefined

  const { receiptUrl, documentType: issuedDocType } = await provider.issueReceipt({
    chargeId,
    amount: charge.amount,
    parentName,
    description,
    orgName,
    date: today,
    documentType,
    vatAmount,
    customerTaxId,
  })

  // ── 5. Atomic update — only if not already issued ─────────────────────────
  const { data: updatedRows, error: updateError } = await db
    .from('charges')
    .update({
      receipt_url: receiptUrl,
      receipt_issued_at: new Date().toISOString(),
      document_type: issuedDocType,
    })
    .eq('id', chargeId)
    .is('receipt_issued_at', null) // atomic guard against concurrent calls
    .select('id')

  if (updateError) {
    console.error('[receipts] Failed to update charge with receipt URL', {
      chargeId,
      orgId,
      error: updateError.message,
    })
    return null
  }

  if (!updatedRows?.length) {
    console.warn('[receipts] Receipt update matched no row — concurrent issuance or race', {
      chargeId,
      orgId,
    })
    return null
  }

  // ── 6. WhatsApp notification — best-effort ────────────────────────────────
  const parentPhone = parent?.phone
  const phoneNumberId = org?.whatsapp_phone_number_id
  const encryptedToken = org?.whatsapp_access_token

  if (parentPhone && phoneNumberId && encryptedToken) {
    try {
      const accessToken = decryptToken(encryptedToken)
      const receiptBody = await resolveTemplate(orgId, 'receipt_notification', {
        amount: charge.amount.toFixed(2),
        receipt_url: receiptUrl,
      })
      await sendTextMessage(parentPhone, receiptBody, accessToken, phoneNumberId)
    } catch (err) {
      console.error('[receipts] Failed to send WhatsApp receipt message', {
        chargeId,
        orgId,
        parentPhone,
        err,
      })
    }
  }

  console.info('[receipts] Receipt issued successfully', { chargeId, orgId, receiptUrl })
  return receiptUrl
}
