/**
 * Sumit API client — server-only.
 *
 * Covers two Sumit API groups used for SaaS platform billing:
 *   - Accounting (Documents): create + send invoices
 *   - Payments: direct charge with stored card token
 *
 * Auth: Credentials object (CompanyID + APIKey) in every request body.
 * Base URL: https://api.sumit.co.il
 *
 * @see https://api.sumit.co.il (Sumit API docs)
 */

const SUMIT_API_BASE = 'https://api.sumit.co.il'

// ─── Credentials ─────────────────────────────────────────────────────────────

export type SumitCredentials = {
  CompanyID: number
  APIKey: string
}

export function getSumitCredentials(): SumitCredentials {
  const companyIdRaw = process.env.SUMIT_COMPANY_ID?.trim()
  const apiKey = process.env.SUMIT_API_KEY?.trim()
  if (!companyIdRaw || !apiKey) {
    throw new Error('[sumit] SUMIT_COMPANY_ID and SUMIT_API_KEY must be set')
  }
  const companyId = parseInt(companyIdRaw, 10)
  if (isNaN(companyId)) {
    throw new Error('[sumit] SUMIT_COMPANY_ID must be a numeric value')
  }
  return { CompanyID: companyId, APIKey: apiKey }
}

// ─── Shared fetch helper ──────────────────────────────────────────────────────

interface SumitBaseResponse {
  Succeed?: boolean
  ErrorMessage?: string
}

async function sumitPost<T extends SumitBaseResponse>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${SUMIT_API_BASE}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json: T
  try {
    json = JSON.parse(text) as T
  } catch {
    throw new Error(`[sumit] Non-JSON response from ${path} (HTTP ${res.status}): ${text.slice(0, 300)}`)
  }

  if (!res.ok) {
    throw new Error(`[sumit] HTTP ${res.status} from ${path}: ${json.ErrorMessage ?? text.slice(0, 200)}`)
  }

  if (json.Succeed === false) {
    throw new Error(`[sumit] Request rejected at ${path}: ${json.ErrorMessage ?? 'unknown error'}`)
  }

  return json
}

// ─── Document types ───────────────────────────────────────────────────────────

/** Sumit document type codes */
export const SUMIT_DOC_TYPE = {
  TAX_INVOICE: 1,         // חשבונית מס
  RECEIPT: 2,             // קבלה
  TAX_INVOICE_RECEIPT: 5, // חשבונית מס קבלה
} as const

export type SumitDocumentType = typeof SUMIT_DOC_TYPE[keyof typeof SUMIT_DOC_TYPE]

// ─── Create document ──────────────────────────────────────────────────────────

export type SumitCreateDocumentParams = {
  customerName: string
  customerEmail: string | null
  /** Amount in ILS (VAT included) */
  amount: number
  description: string
  /** External reference ID (e.g. our subscription ID) */
  reference?: string | null
  documentType?: SumitDocumentType
}

interface SumitCreateDocumentResponse extends SumitBaseResponse {
  ReturnValue?: {
    DocumentID?: number
    DocumentNumber?: number
    DocumentURL?: string
    DocumentPDFURL?: string
  }
}

export type SumitDocumentResult = {
  documentId: number
  documentUrl: string | null
}

/**
 * Creates a tax invoice + receipt document in Sumit.
 * Returns the Sumit document ID and URL for storage in saas_invoices.
 */
export async function createSumitDocument(
  params: SumitCreateDocumentParams
): Promise<SumitDocumentResult> {
  const creds = getSumitCredentials()

  const body = {
    Credentials: creds,
    Details: {
      Type: params.documentType ?? SUMIT_DOC_TYPE.TAX_INVOICE_RECEIPT,
      Customer: {
        Name: params.customerName,
        EmailAddress: params.customerEmail ?? null,
        SearchMode: 0,
      },
      Description: params.description,
      ExternalReference: params.reference ?? null,
      SendByEmail: params.customerEmail
        ? {
            EmailAddress: params.customerEmail,
            Original: true,
            SendAsPaymentRequest: false,
          }
        : null,
    },
    Items: [
      {
        Quantity: 1,
        UnitPrice: params.amount,
        TotalPrice: params.amount,
        Item: {
          Name: params.description,
          SearchMode: 0,
        },
      },
    ],
    VATIncluded: true,
  }

  const res = await sumitPost<SumitCreateDocumentResponse>(
    '/accounting/documents/create/',
    body
  )

  const documentId = res.ReturnValue?.DocumentID
  if (!documentId) {
    throw new Error('[sumit] createDocument: no DocumentID in response')
  }

  return {
    documentId,
    documentUrl: res.ReturnValue?.DocumentURL ?? res.ReturnValue?.DocumentPDFURL ?? null,
  }
}

// ─── Send document by email ───────────────────────────────────────────────────

export type SumitSendDocumentParams = {
  documentId: number
  emailAddress: string
}

/**
 * Sends an existing Sumit document to the customer by email.
 * Idempotent — safe to call multiple times.
 */
export async function sendSumitDocument(params: SumitSendDocumentParams): Promise<void> {
  const creds = getSumitCredentials()

  await sumitPost('/accounting/documents/send/', {
    Credentials: creds,
    EntityID: params.documentId,
    EmailAddress: params.emailAddress,
    Original: true,
    Language: 'Hebrew (0)',
  })
}

// ─── Charge with stored card token ───────────────────────────────────────────

export type SumitChargeParams = {
  customerName: string
  customerEmail: string | null
  /** Sumit payment token from a previous transaction */
  paymentToken: string
  /** Amount in ILS */
  amount: number
  description: string
  reference?: string | null
  /** Whether to also create a document (invoice) for this charge */
  createDocument?: boolean
}

interface SumitChargeResponse extends SumitBaseResponse {
  ReturnValue?: {
    DocumentID?: number
    DocumentURL?: string
    TransactionID?: string
    CardLastDigits?: string
  }
}

export type SumitChargeResult = {
  transactionId: string | null
  documentId: number | null
  documentUrl: string | null
  cardLastFour: string | null
}

/**
 * Charges a customer using a stored Sumit payment token.
 * Used for automatic subscription renewals.
 *
 * @throws if Sumit rejects the charge (declined, expired token, etc.)
 */
export async function chargeSumitToken(params: SumitChargeParams): Promise<SumitChargeResult> {
  const creds = getSumitCredentials()

  const body = {
    Credentials: creds,
    Customer: {
      Name: params.customerName,
      EmailAddress: params.customerEmail ?? null,
      SearchMode: 0,
    },
    PaymentMethod: {
      CreditCard_Token: params.paymentToken,
      Type: 1,
    },
    Items: [
      {
        Quantity: 1,
        UnitPrice: params.amount,
        Item: {
          Name: params.description,
          SearchMode: null,
        },
      },
    ],
    VATIncluded: true,
    SendDocumentByEmail: params.customerEmail ? true : false,
    PreventDocumentCreation: params.createDocument === false ? true : false,
    DocumentDescription: params.description,
  }

  const res = await sumitPost<SumitChargeResponse>('/billing/payments/charge/', body)

  return {
    transactionId: res.ReturnValue?.TransactionID ?? null,
    documentId: res.ReturnValue?.DocumentID ?? null,
    documentUrl: res.ReturnValue?.DocumentURL ?? null,
    cardLastFour: res.ReturnValue?.CardLastDigits ?? null,
  }
}
