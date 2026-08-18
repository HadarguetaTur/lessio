/**
 * Accounting export — generates invoice and credit-note rows
 * for external accounting software or CSV download.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import { getT } from '@/lib/i18n/serverTranslator'
import type { AppLocale } from '@/lib/i18n/locale'

export interface AccountingExportRow {
  type: 'invoice' | 'credit_note'
  date: string
  documentNumber: string
  customerName: string
  customerTaxId: string
  description: string
  amountNet: string
  vatAmount: string
  amountGross: string
  paymentStatus: 'paid' | 'open'
  paymentDate: string
  receiptNumber: string
}

export async function getAccountingExport(
  orgId: string,
  timezone: string,
  range: { from: string; to: string },
  locale: AppLocale = 'he'
): Promise<AccountingExportRow[]> {
  const t = await getT('receipts', locale)
  const db = createServiceRoleClient()

  // Fetch billing records that have an invoice or credit note within the date range
  const { data: records, error } = await db
    .from('student_monthly_billing')
    .select(
      `
      id,
      billing_month,
      total_amount,
      vat_amount,
      is_paid,
      invoice_number,
      invoice_issued_at,
      credit_note_number,
      credit_note_issued_at,
      credit_note_reason,
      student_id,
      parent_id
    `
    )
    .eq('organization_id', orgId)
    .or(
      `and(invoice_issued_at.gte.${range.from},invoice_issued_at.lt.${range.to}),and(credit_note_issued_at.gte.${range.from},credit_note_issued_at.lt.${range.to})`
    )

  if (error) throw new Error(`Accounting export query failed: ${error.message}`)
  if (!records || records.length === 0) return []

  // Collect unique student and parent IDs for name lookups
  const studentIds = [...new Set(records.map((r) => r.student_id as string).filter(Boolean))]
  const parentIds = [...new Set(records.map((r) => r.parent_id as string).filter(Boolean))]

  const [studentsRes, parentsRes] = await Promise.all([
    studentIds.length > 0
      ? db.from('students').select('id, full_name').in('id', studentIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    parentIds.length > 0
      ? db.from('parents').select('id, full_name, tax_id').in('id', parentIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; tax_id: string | null }[] }),
  ])

  const studentNameMap = new Map<string, string>()
  for (const s of studentsRes.data ?? []) {
    studentNameMap.set(s.id, s.full_name)
  }

  const parentMap = new Map<string, { name: string; taxId: string }>()
  for (const p of parentsRes.data ?? []) {
    parentMap.set(p.id, { name: p.full_name, taxId: p.tax_id ?? '' })
  }

  // Fetch linked charges for payment status / receipt info
  const billingIds = records.map((r) => r.id as string)
  const { data: charges } = await db
    .from('charges')
    .select('billing_record_id, status, paid_at, receipt_url')
    .in('billing_record_id', billingIds)

  const chargeMap = new Map<
    string,
    { status: string; paidAt: string | null; receiptUrl: string | null }
  >()
  for (const c of charges ?? []) {
    if (c.billing_record_id) {
      chargeMap.set(c.billing_record_id as string, {
        status: c.status as string,
        paidAt: c.paid_at as string | null,
        receiptUrl: c.receipt_url as string | null,
      })
    }
  }

  const rows: AccountingExportRow[] = []

  for (const rec of records) {
    const studentName = studentNameMap.get(rec.student_id as string) ?? ''
    const parent = rec.parent_id ? parentMap.get(rec.parent_id as string) : undefined
    const customerName = parent?.name ?? studentName
    const customerTaxId = parent?.taxId ?? ''
    const charge = chargeMap.get(rec.id as string)
    const totalAmount = Number(rec.total_amount)
    const vatAmount = Number(rec.vat_amount ?? 0)
    const netAmount = totalAmount - vatAmount

    // Invoice row
    if (rec.invoice_number && rec.invoice_issued_at) {
      const issuedDt = DateTime.fromISO(rec.invoice_issued_at as string, { zone: 'utc' }).setZone(
        timezone
      )
      const invoiceInRange =
        issuedDt >= DateTime.fromISO(range.from, { zone: timezone }) &&
        issuedDt < DateTime.fromISO(range.to, { zone: timezone })

      if (invoiceInRange) {
        rows.push({
          type: 'invoice',
          date: issuedDt.toFormat('yyyy-MM-dd'),
          documentNumber: rec.invoice_number as string,
          customerName,
          customerTaxId,
          description: t('monthlyCharge', { month: rec.billing_month as string }),
          amountNet: netAmount.toFixed(2),
          vatAmount: vatAmount.toFixed(2),
          amountGross: totalAmount.toFixed(2),
          paymentStatus: charge?.status === 'paid' ? 'paid' : 'open',
          paymentDate: charge?.paidAt
            ? DateTime.fromISO(charge.paidAt, { zone: 'utc' })
                .setZone(timezone)
                .toFormat('yyyy-MM-dd')
            : '',
          receiptNumber: extractReceiptNumber(charge?.receiptUrl ?? ''),
        })
      }
    }

    // Credit note row (negative amounts)
    if (rec.credit_note_number && rec.credit_note_issued_at) {
      const issuedDt = DateTime.fromISO(rec.credit_note_issued_at as string, {
        zone: 'utc',
      }).setZone(timezone)
      const cnInRange =
        issuedDt >= DateTime.fromISO(range.from, { zone: timezone }) &&
        issuedDt < DateTime.fromISO(range.to, { zone: timezone })

      if (cnInRange) {
        rows.push({
          type: 'credit_note',
          date: issuedDt.toFormat('yyyy-MM-dd'),
          documentNumber: rec.credit_note_number as string,
          customerName,
          customerTaxId,
          description: t('creditNoteLine', {
            reason:
              (rec.credit_note_reason as string) ||
              t('chargeFallback', { month: rec.billing_month as string }),
          }),
          amountNet: (-netAmount).toFixed(2),
          vatAmount: (-vatAmount).toFixed(2),
          amountGross: (-totalAmount).toFixed(2),
          paymentStatus: 'paid',
          paymentDate: issuedDt.toFormat('yyyy-MM-dd'),
          receiptNumber: '',
        })
      }
    }
  }

  // Sort by date ascending, then document number
  rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare
    return a.documentNumber.localeCompare(b.documentNumber)
  })

  return rows
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract a receipt number from a URL like `.../receipt-123.pdf` or return empty string */
function extractReceiptNumber(url: string): string {
  if (!url) return ''
  const match = url.match(/receipt[_-]?(\d+)/)
  return match ? match[1] : ''
}
