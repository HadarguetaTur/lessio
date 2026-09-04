import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { DateTime } from 'luxon'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getNextInvoiceNumber } from './issueInvoiceNumber'
import { uploadInvoicePdf } from './uploadInvoicePdf'
import InvoiceDocument from './InvoiceDocument'
import type { InvoiceLineItem, InvoiceLabels } from './InvoiceDocument'
import { getT } from '@/lib/i18n/serverTranslator'
import { resolveRecipientLocale, toIntlLocale } from '@/lib/i18n/locale'

/**
 * Generates a tax invoice PDF for a monthly billing record, stores it
 * in Supabase Storage, and updates the billing record with the invoice metadata.
 */
export async function generateAndStoreInvoice(
  billingId: string,
  orgId: string
): Promise<{ invoiceNumber: string; pdfUrl: string }> {
  const supabase = createServiceRoleClient()

  // ── 1. Load billing record + related data ─────────────────────────────────

  const { data: billing, error: billingError } = await supabase
    .from('student_monthly_billing')
    .select('*')
    .eq('id', billingId)
    .eq('organization_id', orgId)
    .single()

  if (billingError || !billing) {
    throw new Error(
      `[generateAndStoreInvoice] billing record not found: ${billingError?.message ?? 'null'}`
    )
  }

  // Already has an invoice — return existing
  if (billing.invoice_number && billing.invoice_pdf_url) {
    return {
      invoiceNumber: billing.invoice_number,
      pdfUrl: billing.invoice_pdf_url,
    }
  }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('id', billing.student_id)
    .single()

  if (studentError || !student) {
    throw new Error(
      `[generateAndStoreInvoice] student not found: ${studentError?.message ?? 'null'}`
    )
  }

  let parentName = ''
  let parentLocale: string | null = null
  if (billing.parent_id) {
    const { data: parent } = await supabase
      .from('parents')
      .select('id, full_name, preferred_locale')
      .eq('id', billing.parent_id)
      .single()
    if (parent) {
      parentName = (parent.full_name ?? '').trim()
      parentLocale = (parent.preferred_locale as string | null) ?? null
    }
  }
  if (!parentName) {
    parentName = (student.full_name ?? '').trim()
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select(
      'id, name, business_legal_name, tax_id, business_address, logo_url, currency, default_vat_rate, default_locale'
    )
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    throw new Error(
      `[generateAndStoreInvoice] org not found: ${orgError?.message ?? 'null'}`
    )
  }

  // ── 2. Get next invoice number ────────────────────────────────────────────

  const now = DateTime.now()
  const year = now.year
  const invoiceNumber = await getNextInvoiceNumber(orgId, year, 'invoice')

  // ── 3. Compute VAT ───────────────────────────────────────────────────────

  const totalAmount = Number(billing.total_amount)
  const vatRate = Number(org.default_vat_rate ?? 0)
  const vatAmount = Math.round(totalAmount * vatRate) / 100

  // ── 4. Build line items ───────────────────────────────────────────────────

  // The invoice is read by the parent, so every label follows their language —
  // not whoever happened to trigger generation.
  const locale = resolveRecipientLocale({
    stored: parentLocale,
    orgDefault: org.default_locale as string | null,
  })
  const t = await getT('billing', locale)
  const labels: InvoiceLabels = {
    title: t('invoice.title'),
    taxIdPrefix: t('invoice.taxIdPrefix'),
    invoiceNumber: t('invoice.invoiceNumber'),
    date: t('invoice.date'),
    billingPeriod: t('invoice.billingPeriod'),
    recipient: t('invoice.recipient'),
    studentPrefix: t('invoice.studentPrefix'),
    voids: t('invoice.voids'),
    colDescription: t('invoice.colDescription'),
    colAmount: t('invoice.colAmount'),
    subtotal: t('invoice.subtotal'),
    vat: t('invoice.vat'),
    grandTotal: t('invoice.grandTotal'),
  }

  const lineItems: InvoiceLineItem[] = []

  const lessonsAmount = Number(billing.lessons_amount ?? 0)
  if (lessonsAmount !== 0) {
    lineItems.push({
      description: t('invoice.lineLessons', { count: billing.lessons_count ?? 0 }),
      amount: lessonsAmount,
    })
  }

  const subscriptionsAmount = Number(billing.subscriptions_amount ?? 0)
  if (subscriptionsAmount !== 0) {
    lineItems.push({
      description: t('invoice.lineSubscription'),
      amount: subscriptionsAmount,
    })
  }

  const cancellationsAmount = Number(billing.cancellations_amount ?? 0)
  if (cancellationsAmount !== 0) {
    lineItems.push({
      description: t('invoice.lineCancellations'),
      amount: cancellationsAmount,
    })
  }

  const manualAdjustment = Number(billing.manual_adjustment_amount ?? 0)
  if (manualAdjustment !== 0) {
    lineItems.push({
      description: billing.manual_adjustment_reason
        ? t('invoice.lineAdjustmentWithReason', { reason: billing.manual_adjustment_reason })
        : t('invoice.lineAdjustment'),
      amount: manualAdjustment,
    })
  }

  // ── 5. Render PDF ─────────────────────────────────────────────────────────

  const subtotal = totalAmount
  const total = Math.round((totalAmount + vatAmount) * 100) / 100
  const studentName = (student.full_name ?? '').trim()
  const invoiceDate = now.toFormat('dd/MM/yyyy')
  const currency = org.currency ?? 'ILS'

  const element = React.createElement(InvoiceDocument, {
    labels,
    intlLocale: toIntlLocale(locale),
    orgLegalName: org.business_legal_name ?? org.name ?? '',
    orgTaxId: org.tax_id ?? null,
    orgAddress: org.business_address ?? null,
    orgLogoUrl: org.logo_url ?? null,
    currency,
    parentName,
    studentName,
    billingMonth: billing.period_start && billing.period_end
      ? `${billing.period_start} – ${billing.period_end}`
      : billing.billing_month,
    lineItems,
    subtotal,
    vatAmount,
    total,
    invoiceNumber,
    invoiceDate,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any)

  // ── 6. Upload PDF ─────────────────────────────────────────────────────────

  const fileName = `invoice-${invoiceNumber.replace(/\//g, '-')}`
  const storagePath = await uploadInvoicePdf(
    orgId,
    year,
    fileName,
    Buffer.from(pdfBuffer)
  )

  // ── 7. Update billing record ──────────────────────────────────────────────

  const { error: updateError } = await supabase
    .from('student_monthly_billing')
    .update({
      invoice_number: invoiceNumber,
      invoice_pdf_url: storagePath,
      vat_amount: vatAmount,
      invoice_issued_at: now.toISO(),
    })
    .eq('id', billingId)
    .eq('organization_id', orgId)

  if (updateError) {
    throw new Error(
      `[generateAndStoreInvoice] failed to update billing record: ${updateError.message}`
    )
  }

  return { invoiceNumber, pdfUrl: storagePath }
}
