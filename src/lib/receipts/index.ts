/**
 * Receipt provider abstraction layer — server-only.
 * Per /docs/sprint-15-scope.md § Story 1.
 * Extended Sprint 27: document type (receipt vs tax_invoice), VAT, credit notes.
 *
 * ReceiptProvider is the interface all receipt adapters must implement.
 * Adapters: Green Invoice, iCount, Sumit.
 */

export type DocumentType = 'receipt' | 'tax_invoice'

/**
 * Who issues this org's invoices. Only 'external' lets Lessio issue one itself;
 * the other two exist to stop us adding a second document to a payment that
 * already produced one somewhere else.
 * null (not represented here) means the owner has not been asked yet.
 */
export type ReceiptMode = 'external' | 'payment_provider' | 'none'

export interface ReceiptProvider {
  /**
   * Issues a receipt or tax invoice for a completed payment.
   * Returns the document URL and the provider's document ID.
   */
  issueReceipt(params: {
    chargeId: string        // stored as external reference in the document
    amount: number          // in org currency
    parentName: string      // recipient name on the receipt
    description: string     // line item description (e.g. "שיעור - Maya Cohen")
    orgName: string         // issuing business name
    date: string            // YYYY-MM-DD in org timezone
    documentType?: DocumentType  // default 'receipt'
    vatAmount?: number           // required when documentType = 'tax_invoice'
    customerTaxId?: string       // optional, for B2B invoices
  }): Promise<{ receiptUrl: string; receiptId: string; documentType: DocumentType }>

  /**
   * Issues a credit note to cancel/reverse a previously issued document.
   * Optional — providers that don't support credit notes should not implement this.
   */
  issueCreditNote?(params: {
    chargeId: string
    amount: number
    parentName: string
    description: string
    orgName: string
    date: string
    vatAmount: number
    customerTaxId?: string
    originalInvoiceNumber: string
  }): Promise<{ creditNoteUrl: string; creditNoteId: string }>
}

export class ReceiptProviderNotConfiguredError extends Error {
  constructor(orgId: string) {
    super(`[receipts] No receipt provider configured for org ${orgId}`)
    this.name = 'ReceiptProviderNotConfiguredError'
  }
}
