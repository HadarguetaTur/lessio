/**
 * Green Invoice (חשבוניות ירוקות) receipt adapter.
 * Per /docs/sprint-15-scope.md § Story 1.
 *
 * API reference: https://app.greeninvoice.co.il/api-docs
 * Base URL: https://api.greeninvoice.co.il/api/v1
 *
 * Auth flow:
 *   POST /account/token  { id, secret }  →  { token }  (JWT, ~30 min TTL)
 *   All subsequent requests: Authorization: Bearer <token>
 *
 * Receipt document type: 320 (קבלה)
 * Token fetched fresh per call — no in-memory caching (serverless environment).
 */

import type { DocumentType, ReceiptProvider } from './index'

const GREEN_INVOICE_BASE = 'https://api.greeninvoice.co.il/api/v1'

export interface GreenInvoiceConfig {
  id: string      // API key ID from Green Invoice dashboard
  secret: string  // API key secret from Green Invoice dashboard
}

interface GreenInvoiceTokenResponse {
  token: string
}

interface GreenInvoiceDocumentResponse {
  id: string
  url?: string
  number?: string
}

export class GreenInvoiceProvider implements ReceiptProvider {
  constructor(private config: GreenInvoiceConfig) {}

  private async createDocument(
    docType: number,
    params: {
      chargeId: string
      amount: number
      parentName: string
      description: string
      orgName: string
      date: string
      vatAmount?: number
      customerTaxId?: string
    }
  ): Promise<{ url: string; id: string }> {
    const token = await this.getToken()

    const docDescription =
      params.orgName.trim().length > 0
        ? `${params.orgName.trim()} — ${params.description}`
        : params.description

    const hasVat = (params.vatAmount ?? 0) > 0
    const client: Record<string, unknown> = { name: params.parentName, add: false }
    if (params.customerTaxId) {
      client.taxId = params.customerTaxId
    }

    const body = {
      description: docDescription,
      type: docType,
      date: params.date,
      dueDate: params.date,
      lang: 'he',
      currency: 'ILS',
      vatType: hasVat ? 1 : 0,
      discount: 0,
      rounding: false,
      signed: false,
      client,
      income: [
        {
          catalogNum: '',
          description: docDescription,
          quantity: 1,
          price: params.amount,
          currency: 'ILS',
          vatType: hasVat ? 1 : 0,
        },
      ],
      payment: [
        {
          type: 5,
          price: params.amount + (params.vatAmount ?? 0),
          currency: 'ILS',
          date: params.date,
          ref: params.chargeId,
        },
      ],
    }

    const res = await fetch(`${GREEN_INVOICE_BASE}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`[green-invoice] Documents API error ${res.status}: ${detail}`)
    }

    const json = (await res.json()) as GreenInvoiceDocumentResponse
    if (!json.id) {
      throw new Error(`[green-invoice] Response missing document id: ${JSON.stringify(json)}`)
    }

    return {
      url: json.url ?? `https://app.greeninvoice.co.il/documents/${json.id}`,
      id: json.id,
    }
  }

  async issueReceipt(params: {
    chargeId: string
    amount: number
    parentName: string
    description: string
    orgName: string
    date: string
    documentType?: DocumentType
    vatAmount?: number
    customerTaxId?: string
  }): Promise<{ receiptUrl: string; receiptId: string; documentType: DocumentType }> {
    const docType = params.documentType ?? 'receipt'
    // 305 = חשבונית מס (tax invoice), 320 = קבלה (receipt)
    const greenType = docType === 'tax_invoice' ? 305 : 320
    const result = await this.createDocument(greenType, params)
    return { receiptUrl: result.url, receiptId: result.id, documentType: docType }
  }

  async issueCreditNote(params: {
    chargeId: string
    amount: number
    parentName: string
    description: string
    orgName: string
    date: string
    vatAmount: number
    customerTaxId?: string
    originalInvoiceNumber: string
  }): Promise<{ creditNoteUrl: string; creditNoteId: string }> {
    const description = `${params.description} (מבטלת חשבונית ${params.originalInvoiceNumber})`
    // Green Invoice type 330 = חשבונית זיכוי (credit note)
    const result = await this.createDocument(330, { ...params, description })
    return { creditNoteUrl: result.url, creditNoteId: result.id }
  }

  private async getToken(): Promise<string> {
    const res = await fetch(`${GREEN_INVOICE_BASE}/account/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.config.id, secret: this.config.secret }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`[green-invoice] Token API error ${res.status}: ${detail}`)
    }

    const json = (await res.json()) as GreenInvoiceTokenResponse

    if (!json.token) {
      throw new Error('[green-invoice] Token response missing token field')
    }

    return json.token
  }
}
