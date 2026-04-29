import React from 'react'
import InvoiceDocument from './InvoiceDocument'
import type { InvoiceLineItem } from './InvoiceDocument'

export interface CreditNoteDocumentProps {
  // Org branding
  orgLegalName: string
  orgTaxId: string | null
  orgAddress: string | null
  orgLogoUrl: string | null
  currency: string

  // Recipient
  parentName: string
  studentName: string

  // Billing details
  billingMonth: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  vatAmount: number
  total: number

  // Credit note metadata
  creditNoteNumber: string
  creditNoteDate: string
  originalInvoiceNumber: string
}

/**
 * Credit note PDF document.
 *
 * Reuses InvoiceDocument with a red header, negative amounts,
 * and a reference to the original invoice being credited.
 */
export default function CreditNoteDocument({
  orgLegalName,
  orgTaxId,
  orgAddress,
  orgLogoUrl,
  currency,
  parentName,
  studentName,
  billingMonth,
  lineItems,
  subtotal,
  vatAmount,
  total,
  creditNoteNumber,
  creditNoteDate,
  originalInvoiceNumber,
}: CreditNoteDocumentProps) {
  // Negate all amounts for credit note display
  const negatedItems: InvoiceLineItem[] = lineItems.map((item) => ({
    description: item.description,
    amount: -Math.abs(item.amount),
  }))

  return (
    <InvoiceDocument
      orgLegalName={orgLegalName}
      orgTaxId={orgTaxId}
      orgAddress={orgAddress}
      orgLogoUrl={orgLogoUrl}
      currency={currency}
      parentName={parentName}
      studentName={studentName}
      billingMonth={billingMonth}
      lineItems={negatedItems}
      subtotal={-Math.abs(subtotal)}
      vatAmount={-Math.abs(vatAmount)}
      total={-Math.abs(total)}
      invoiceNumber={creditNoteNumber}
      invoiceDate={creditNoteDate}
      headerTitle={'\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05D6\u05D9\u05DB\u05D5\u05D9'} // חשבונית זיכוי
      headerColor="#dc2626"
      referenceInvoice={originalInvoiceNumber}
    />
  )
}
