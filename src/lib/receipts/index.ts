/**
 * Receipt provider abstraction layer — server-only.
 * Per /docs/sprint-15-scope.md § Story 1.
 *
 * ReceiptProvider is the interface all receipt adapters must implement.
 * Currently the only adapter is Green Invoice (חשבוניות ירוקות).
 * Future: iCount, Priority, etc.
 */

export interface ReceiptProvider {
  /**
   * Issues a receipt for a completed payment.
   * Returns the receipt URL (for display + WhatsApp) and the provider's document ID.
   */
  issueReceipt(params: {
    chargeId: string        // stored as external reference in the document
    amount: number          // ILS
    parentName: string      // recipient name on the receipt
    description: string     // line item description (e.g. "שיעור - Maya Cohen")
    orgName: string         // issuing business name
    date: string            // YYYY-MM-DD in org timezone
  }): Promise<{ receiptUrl: string; receiptId: string }>
}

export class ReceiptProviderNotConfiguredError extends Error {
  constructor(orgId: string) {
    super(`[receipts] No receipt provider configured for org ${orgId}`)
    this.name = 'ReceiptProviderNotConfiguredError'
  }
}
