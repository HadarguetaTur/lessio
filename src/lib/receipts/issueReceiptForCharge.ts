/**
 * Idempotent receipt issuance for a paid charge.
 * Per /docs/sprint-15-scope.md § Story 2.
 *
 * Steps:
 * 1. Load charge (with parent + org).
 * 2. Guard: if receipt_issued_at already set → return (already issued).
 * 3. Resolve the parties printed on the document.
 * 4. Guard: if receipt_mode says someone else issues → return null silently.
 * 5. Guard: if no receipt provider configured → return null silently.
 * 6. Atomically claim receipt issuance before calling the provider.
 * 7. Call provider and finalise our claim; release it if the provider fails.
 * 8. Send WhatsApp to parent: best-effort, catch + log.
 * 9. Return receipt URL.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getReceiptProvider } from './factory'
import { ReceiptProviderNotConfiguredError, type ReceiptMode } from './index'
import { notifyParentOfReceipt } from './notifyParentOfReceipt'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { renderChargeNote } from '@/lib/charges/renderNote'

/**
 * Issues a receipt for a paid charge and updates the charge row.
 *
 * `notifyParent: false` skips step 8 for callers that fold the receipt link into
 * a message of their own (the manual payment confirmation), so the parent does
 * not get a "thank you" and a "here is your receipt" as two separate bubbles.
 *
 * @returns receipt URL on success, null if provider not configured or receipt already issued.
 * Receipt failure never rolls back a completed payment — always fire-and-forget from callers.
 */
export async function issueReceiptForCharge(
  chargeId: string,
  orgId: string,
  options: { notifyParent?: boolean } = {}
): Promise<string | null> {
  const { notifyParent = true } = options
  const db = createServiceRoleClient()

  // ── 1. Load charge with parent + org ───────────────────────────────────────
  const { data: charge, error: chargeError } = await db
    .from('charges')
    .select(
      'id, amount, charge_type, billing_month, notes, status, receipt_issued_at, parent_id, parents(full_name, phone, tax_id, preferred_locale), organizations(name, timezone, whatsapp_phone_number_id, whatsapp_access_token, receipt_document_type, receipt_mode, default_vat_rate, default_locale)'
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

  // ── 3. The parties on the document ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parent = (charge as any).parents as {
    full_name: string
    phone: string | null
    tax_id: string | null
    preferred_locale: string | null
  } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const org = (charge as any).organizations as {
    name: string
    timezone: string | null
    whatsapp_phone_number_id: string | null
    whatsapp_access_token: string | null
    receipt_document_type: string | null
    receipt_mode: string | null
    default_vat_rate: number | null
    default_locale: string | null
  } | null

  // ── 4. Does this org issue its documents here at all? ─────────────────────
  // The owner may have told us their payment provider issues the invoice, or
  // that they invoice outside Lessio entirely. Issuing anyway would put a
  // second document on a payment that already has one. Checked before the
  // provider is loaded so stale credentials from a previous choice cannot fire.
  const receiptMode = (org?.receipt_mode ?? null) as ReceiptMode | null
  if (receiptMode !== null && receiptMode !== 'external') {
    console.debug('[receipts] Issuing happens outside Lessio — skipping', {
      chargeId,
      orgId,
      receiptMode,
    })
    return null
  }

  // ── 5. Load receipt provider ───────────────────────────────────────────────
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

  // Printed on the real tax document the parent receives, so it follows their
  // language rather than whoever triggered the receipt.
  const locale = resolveRecipientLocale({
    stored: parent?.preferred_locale,
    orgDefault: org?.default_locale,
  })
  const t = await getT('receipts', locale)
  // renderChargeNote resolves fully-qualified keys (charges.*), so it needs a
  // root-scoped translator — the receipts-scoped `t` would leak the raw key
  // onto the printed document.
  const tRoot = await getT(undefined, locale)

  const parentName = parent?.full_name ?? t('customer')
  const orgName = org?.name ?? ''
  const tz = org?.timezone ?? 'Asia/Jerusalem'
  const chargeType = charge.charge_type as string
  const billingMonth = (charge.billing_month as string | null) ?? null
  const today =
    DateTime.now().setZone(tz).toISODate() ??
    new Date().toISOString().slice(0, 10)

  // `charge.notes` holds a code for generated notes, so it has to go through
  // renderChargeNote rather than being printed raw.
  const noteText = renderChargeNote(charge.notes as string | null, tRoot)

  const description =
    chargeType === 'monthly'
      ? (noteText ?? t('monthlyCharge', { month: billingMonth ?? '' })).trim()
      : chargeType === 'cancellation'
        ? t('cancellationPayment', { name: parentName })
        : chargeType === 'manual'
          ? (noteText ?? t('manualCharge', { name: parentName })).trim()
          : t('lessonPayment', { name: parentName })

  const documentType = (org?.receipt_document_type === 'tax_invoice' ? 'tax_invoice' : 'receipt') as import('./index').DocumentType
  const vatRate = Number(org?.default_vat_rate ?? 0)
  const vatAmount = documentType === 'tax_invoice' ? Math.round(charge.amount * vatRate) / 100 : undefined
  const customerTaxId = parent?.tax_id ?? undefined

  const claimTimestamp = new Date().toISOString()
  const { data: claimedRows, error: claimError } = await db
    .from('charges')
    .update({ receipt_issued_at: claimTimestamp })
    .eq('id', chargeId)
    .eq('organization_id', orgId)
    .is('receipt_issued_at', null)
    .select('id')

  if (claimError || !claimedRows?.length) {
    if (claimError) {
      console.error('[receipts] Failed to claim receipt issuance', {
        chargeId,
        orgId,
        error: claimError.message,
      })
    }
    return null
  }

  let issued: Awaited<ReturnType<typeof provider.issueReceipt>>
  try {
    issued = await provider.issueReceipt({
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
  } catch (err) {
    await db
      .from('charges')
      .update({ receipt_issued_at: null })
      .eq('id', chargeId)
      .eq('organization_id', orgId)
      .eq('receipt_issued_at', claimTimestamp)
    throw err
  }
  const { receiptUrl, documentType: issuedDocType } = issued

  // ── 7. Atomic update — only if not already issued ─────────────────────────
  const { data: updatedRows, error: updateError } = await db
    .from('charges')
    .update({
      receipt_url: receiptUrl,
      receipt_issued_at: new Date().toISOString(),
      document_type: issuedDocType,
    })
    .eq('id', chargeId)
    .eq('organization_id', orgId)
    .eq('receipt_issued_at', claimTimestamp)
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

  // ── 8. WhatsApp notification — best-effort ────────────────────────────────
  if (notifyParent) await notifyParentOfReceipt({
    orgId,
    chargeId,
    amount: charge.amount,
    receiptUrl,
    parentPhone: parent?.phone,
    parentLocale: parent?.preferred_locale,
    orgDefaultLocale: org?.default_locale,
    phoneNumberId: org?.whatsapp_phone_number_id,
    encryptedToken: org?.whatsapp_access_token,
  })

  console.info('[receipts] Receipt issued successfully', { chargeId, orgId, receiptUrl })
  return receiptUrl
}
