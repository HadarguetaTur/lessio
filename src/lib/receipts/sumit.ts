/**
 * Sumit (סאמיט) receipt adapter.
 *
 * API reference: https://app.sumit.co.il/developers/api/
 * Base URL: https://api.sumit.co.il
 *
 * Auth: CompanyID + APIKey passed as JSON body fields on every request.
 * No separate token step — credentials are sent with each call.
 *
 * Receipt document type: 400 (קבלה / Receipt)
 *
 * Note: Sumit's full document-creation REST API is not publicly documented in
 * detail; this adapter follows the patterns from their official WooCommerce
 * integration plugin (api.sumit.co.il endpoints, CompanyID + APIKey auth).
 * Adjust the endpoint path or field names if Sumit changes their API.
 */

import type { DocumentType, ReceiptProvider } from './index'

const SUMIT_BASE = 'https://api.sumit.co.il'

export interface SumitConfig {
  companyId: string   // Company ID from Sumit developer settings
  apiKey:    string   // API Key from Sumit developer settings
}

interface SumitDocumentResponse {
  Succeed:      boolean
  ErrorMessage?: string
  ReturnValue?: {
    DocumentID:  string
    DocumentURL: string
    Number?:     string
  }
}

interface SumitValidateResponse {
  Succeed:      boolean
  ErrorMessage?: string
}

export class SumitProvider implements ReceiptProvider {
  constructor(private config: SumitConfig) {}

  async issueReceipt(params: {
    chargeId:    string
    amount:      number
    parentName:  string
    description: string
    orgName:     string
    date:        string
    documentType?: DocumentType
    vatAmount?:    number
    customerTaxId?: string
  }): Promise<{ receiptUrl: string; receiptId: string; documentType: DocumentType }> {
    const { chargeId, amount, parentName, description, orgName, date } = params

    const docDescription =
      orgName.trim().length > 0 ? `${orgName.trim()} — ${description}` : description

    const body = {
      Credentials: {
        CompanyID: this.config.companyId,
        APIKey:    this.config.apiKey,
      },
      DocumentType: 400,        // קבלה (Receipt)
      AccountingKey: 400,
      Date:          date,
      VATIncluded:   true,
      Lang:          'he',
      Currency:      'ILS',
      ClientName:    parentName,
      Reference:     chargeId,
      Details: [
        {
          Description: docDescription,
          Quantity:    1,
          UnitPrice:   amount,
          VATRate:     0,
        },
      ],
      Payments: [
        {
          PaymentType: 1,       // Bank transfer / other
          Amount:      amount,
          Date:        date,
        },
      ],
    }

    const res = await fetch(`${SUMIT_BASE}/accounting/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`[sumit] Documents API error ${res.status}: ${detail}`)
    }

    const json = (await res.json()) as SumitDocumentResponse

    if (!json.Succeed || !json.ReturnValue?.DocumentID) {
      throw new Error(
        `[sumit] Document creation failed: ${json.ErrorMessage ?? 'unknown error'}`
      )
    }

    const receiptUrl =
      json.ReturnValue.DocumentURL ||
      `https://app.sumit.co.il/documents/${json.ReturnValue.DocumentID}`

    return {
      receiptUrl,
      receiptId: json.ReturnValue.DocumentID,
      documentType: 'receipt', // Sumit supports receipts only
    }
  }

  /**
   * Validates credentials against the Sumit account info endpoint.
   * Used by the settings action to test credentials before saving.
   */
  async validateCredentials(): Promise<void> {
    const res = await fetch(`${SUMIT_BASE}/account/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Credentials: {
          CompanyID: this.config.companyId,
          APIKey:    this.config.apiKey,
        },
      }),
    })

    if (!res.ok) {
      throw new Error(`[sumit] Validation API error ${res.status}`)
    }

    const json = (await res.json()) as SumitValidateResponse
    if (!json.Succeed) {
      throw new Error(json.ErrorMessage ?? 'Invalid credentials')
    }
  }
}
