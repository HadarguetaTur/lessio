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

import type { ReceiptProvider } from './index'

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

  async issueReceipt(params: {
    chargeId: string
    amount: number
    parentName: string
    description: string
    orgName: string
    date: string
  }): Promise<{ receiptUrl: string; receiptId: string }> {
    const { chargeId, amount, parentName, description, orgName, date } = params

    const token = await this.getToken()

    const docDescription =
      orgName.trim().length > 0 ? `${orgName.trim()} — ${description}` : description

    const body = {
      description: docDescription,
      type: 320,        // קבלה
      date,
      dueDate: date,
      lang: 'he',
      currency: 'ILS',
      vatType: 0,
      discount: 0,
      rounding: false,
      signed: false,
      client: {
        name: parentName,
        add: false,
      },
      income: [
        {
          catalogNum: '',
          description: docDescription,
          quantity: 1,
          price: amount,
          currency: 'ILS',
          vatType: 0,
        },
      ],
      payment: [
        {
          type: 5,          // bank transfer / other
          price: amount,
          currency: 'ILS',
          date,
          ref: chargeId,
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

    // Green Invoice returns the document URL; fall back to constructing it.
    const receiptUrl =
      json.url ?? `https://app.greeninvoice.co.il/documents/${json.id}`

    return {
      receiptUrl,
      receiptId: json.id,
    }
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
