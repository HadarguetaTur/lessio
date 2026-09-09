/**
 * Sumit (סאמיט) receipt adapter — the org's OWN Sumit company, not Lessio's.
 *
 * Contract source: https://api.sumit.co.il/swagger/v1/swagger.json
 * (re-verified 09.09.2026). Base URL: https://api.sumit.co.il
 *
 * Auth: `Credentials: { CompanyID, APIKey }` in every request body. CompanyID
 * is an integer in the spec, so the stored string is parsed here.
 *
 * ── What was wrong before ────────────────────────────────────────────────────
 * This adapter was written against a guessed contract, the same way the first
 * platform-billing client was (see src/lib/saas/sumit.ts and CLAUDE.md). Four
 * separate things did not exist:
 *
 *   - the endpoint: `POST /accounting/documents` — the real path is
 *     `/accounting/documents/create/`;
 *   - the envelope: it checked `json.Succeed` and read `json.ReturnValue`.
 *     Sumit answers `{ Status, UserErrorMessage, TechnicalErrorDetails, Data }`
 *     with Status 0=Success / 1=BusinessError / 2=TechnicalError. `Succeed` is
 *     always undefined, so `!json.Succeed` was always true and EVERY receipt —
 *     including ones Sumit really issued — threw "Document creation failed";
 *   - the request shape: `DocumentType` / `ClientName` / `Details` / `Reference`
 *     at the top level. The real request is
 *     `{ Credentials, Details: { Type, Customer, ... }, Items, Payments, VATIncluded }`;
 *   - the document type code: 400 is iCount's receipt code. Sumit's
 *     Accounting_Typed_DocumentType is an ordinal enum — Receipt is 2.
 *
 * Envelope parsing is NOT re-implemented here: `unwrapSumit` in
 * src/lib/saas/sumitParse.ts is the single verified reader of Sumit's envelope
 * (it is pure and importless by design), and this adapter reuses it.
 */

import { SumitApiError, unwrapSumit } from '@/lib/saas/sumitParse'
import type { DocumentType, ReceiptProvider } from './index'

const SUMIT_BASE = 'https://api.sumit.co.il'

/** Accounting_Typed_DocumentType — ordinals, per the OpenAPI enum. */
const SUMIT_DOCUMENT_TYPE = {
  /** חשבונית מס קבלה — a tax invoice that also records the payment. */
  INVOICE_AND_RECEIPT: 1,
  /** קבלה */
  RECEIPT: 2,
} as const

/** Accounting_Typed_Language */
const SUMIT_LANGUAGE_HEBREW = 0
/** Accounting_Typed_DocumentCurrency */
const SUMIT_CURRENCY_ILS = 0
/** Accounting_Typed_DocumentPaymentType — "General", i.e. unspecified means. */
const SUMIT_PAYMENT_TYPE_GENERAL = 1

export interface SumitConfig {
  companyId: string   // Company ID from Sumit developer settings
  apiKey:    string   // API Key from Sumit developer settings
}

/** `Accounting_Documents_Create_Response` — the envelope's `Data`. */
interface SumitCreateDocumentData {
  DocumentID?: number | null
  DocumentNumber?: number | null
  CustomerID?: number | null
  DocumentDownloadURL?: string | null
  DocumentPaymentURL?: string | null
}

/** `Accounting_General_GetVATRate_Response` — used only to prove credentials work. */
interface SumitVatRateData {
  Rate?: number | null
}

export class SumitProvider implements ReceiptProvider {
  constructor(private config: SumitConfig) {}

  private credentials(): { CompanyID: number; APIKey: string } {
    const companyId = parseInt(String(this.config.companyId ?? '').trim(), 10)
    if (!Number.isInteger(companyId)) {
      throw new Error('[sumit] companyId must be numeric')
    }
    const apiKey = String(this.config.apiKey ?? '').trim()
    if (!apiKey) {
      throw new Error('[sumit] apiKey is missing')
    }
    return { CompanyID: companyId, APIKey: apiKey }
  }

  /**
   * One POST + one envelope unwrap. Throws SumitApiError on transport failure,
   * a non-JSON body, or any non-Success status — a BusinessError carries
   * Sumit's own Hebrew wording in `userMessage`.
   */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let res: Response
    let text: string
    try {
      res = await fetch(`${SUMIT_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Credentials: this.credentials(), ...body }),
      })
      text = await res.text()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new SumitApiError(path, null, null, `transport: ${msg}`, 0)
    }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new SumitApiError(path, null, null, `non-JSON response: ${text.slice(0, 300)}`, res.status)
    }

    // Sumit still fills the envelope on 4xx/5xx, so unwrapSumit reads the
    // message either way; it throws when Status is not Success.
    return unwrapSumit<T>(path, res.status, json)
  }

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
    const docType: DocumentType = params.documentType ?? 'receipt'
    const path = '/accounting/documents/create/'

    const docDescription =
      orgName.trim().length > 0 ? `${orgName.trim()} — ${description}` : description

    // `amount` is VAT-INCLUSIVE per the ReceiptProvider contract, so
    // VATIncluded is always true: the document total must equal the money that
    // actually moved. `vatAmount` is the VAT already contained in it — passed
    // per item only when the caller computed one (tax invoices for a
    // VAT-registered org). Otherwise Sumit splits it by the company's own
    // registration, which is more authoritative than anything we could guess.
    const hasVat = (params.vatAmount ?? 0) > 0

    const data = await this.post<SumitCreateDocumentData>(path, {
      Details: {
        Type:
          docType === 'tax_invoice'
            ? SUMIT_DOCUMENT_TYPE.INVOICE_AND_RECEIPT
            : SUMIT_DOCUMENT_TYPE.RECEIPT,
        Date: date,
        Customer: {
          Name: parentName,
          ...(params.customerTaxId ? { CompanyNumber: params.customerTaxId } : {}),
        },
        Language: SUMIT_LANGUAGE_HEBREW,
        Currency: SUMIT_CURRENCY_ILS,
        Description: docDescription,
        // Our charge id, so a document can always be traced back to the row.
        ExternalReference: chargeId,
      },
      Items: [
        {
          Quantity:    1,
          UnitPrice:   amount,
          Description: docDescription,
          Item:        { Name: docDescription },
          ...(hasVat ? { VAT: params.vatAmount } : {}),
        },
      ],
      Payments: [
        {
          Amount: amount,
          Type:   SUMIT_PAYMENT_TYPE_GENERAL,
        },
      ],
      VATIncluded: true,
      ...(hasVat ? { VATPerItem: true } : {}),
    })

    const documentId = data.DocumentID
    if (documentId == null) {
      throw new SumitApiError(path, null, null, 'success envelope without DocumentID', 200)
    }

    // DocumentDownloadURL is nullable in the spec. Falling back to the app link
    // rather than throwing is deliberate: the document exists at Sumit by this
    // point, and issueReceiptForCharge releases its claim on a throw, which
    // would issue a second one on the next attempt.
    const receiptUrl =
      data.DocumentDownloadURL?.trim() || `https://app.sumit.co.il/documents/${documentId}`

    return {
      receiptUrl,
      receiptId: String(documentId),
      documentType: docType,
    }
  }

  /**
   * Proves CompanyID + APIKey are accepted, without creating anything.
   * `/accounting/general/getvatrate/` takes Credentials alone and returns a
   * rate — the cheapest authenticated read in the API. (The old adapter posted
   * to `/account/get`, which is not a Sumit endpoint.)
   */
  async validateCredentials(): Promise<void> {
    try {
      await this.post<SumitVatRateData>('/accounting/general/getvatrate/', {})
    } catch (e) {
      if (e instanceof SumitApiError) {
        throw new Error(e.userMessage ?? e.technicalDetails ?? 'Invalid credentials')
      }
      throw e
    }
  }
}
