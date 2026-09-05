/**
 * Sumit API client for SaaS platform billing — server-only.
 *
 * Four things Lessio needs from Sumit to bill an organization:
 *   - open a hosted payment page that saves the card on the customer
 *     (`beginSumitRedirect`)
 *   - look a payment up after the customer returns (`getSumitPayment`,
 *     `listSumitPayments`) — the redirect query is a hint, Sumit is the truth
 *   - charge the saved card again at renewal (`chargeSumitCustomer`)
 *   - find the invoice/receipt document a payment produced
 *     (`findSumitDocumentForPayment`)
 *
 * Auth: `Credentials: { CompanyID, APIKey }` in every request body — platform
 * credentials from env, one Sumit company for all of Lessio. Per-org receipts
 * are a different adapter (src/lib/receipts/sumit.ts) with the org's own keys.
 *
 * Field names and envelope are per the OpenAPI spec
 * (https://api.sumit.co.il/swagger/v1/swagger.json); parsing lives in
 * ./sumitParse.ts. Every function here either returns a typed result or throws
 * SumitApiError — callers decide whether a BusinessError is a decline to
 * schedule around or a bug to surface.
 */

import { PRICES_INCLUDE_VAT } from './pricing'
import {
  SumitApiError,
  normalizePayment,
  sumitStatusCode,
  unwrapSumit,
  type SumitEnvelope,
  type SumitPayment,
  type SumitPaymentMethodRaw,
  type SumitPaymentRaw,
} from './sumitParse'

export { SumitApiError } from './sumitParse'
export type { SumitPayment } from './sumitParse'

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

/** True when the platform Sumit credentials are configured (does not call Sumit). */
export function hasSumitCredentials(): boolean {
  try {
    getSumitCredentials()
    return true
  } catch {
    return false
  }
}

// ─── Transport ───────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000

async function sumitPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  let text: string
  try {
    res = await fetch(`${SUMIT_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Credentials: getSumitCredentials(), ...body }),
      signal: controller.signal,
    })
    text = await res.text()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new SumitApiError(path, null, null, `transport: ${msg}`, 0)
  } finally {
    clearTimeout(timer)
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new SumitApiError(path, null, null, `non-JSON response: ${text.slice(0, 300)}`, res.status)
  }

  if (!res.ok) {
    // Sumit puts its own message in the envelope even on 4xx/5xx; unwrap reads it.
    const env = (typeof json === 'object' && json) as SumitEnvelope<unknown> | false
    throw new SumitApiError(
      path,
      env ? (sumitStatusCode(env.Status) as 1 | 2 | null) : null,
      env && typeof env.UserErrorMessage === 'string' ? env.UserErrorMessage : null,
      env && typeof env.TechnicalErrorDetails === 'string' ? env.TechnicalErrorDetails : null,
      res.status
    )
  }

  return unwrapSumit<T>(path, res.status, json)
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Accounting_Typed_DocumentType — what the payment page / charge issues. */
export const SUMIT_DOCUMENT_TYPE = {
  INVOICE_AND_RECEIPT: 1, // חשבונית מס קבלה
} as const

/** Accounting_Typed_Language */
export const SUMIT_LANGUAGE = { he: 0, en: 1 } as const

export type SumitLanguage = keyof typeof SUMIT_LANGUAGE

/**
 * How long the hosted page link stays valid. Sumit defaults to 1 hour, which
 * is short for someone who opens the tab, goes to find a card, and comes back.
 */
export const SUMIT_CHECKOUT_EXPIRATION_HOURS = 4

/** Accounting_Typed_CustomerSearchMode */
const CUSTOMER_SEARCH_BY_EXTERNAL_ID = 2
/** Accounting_Typed_IncomeItemSearchMode */
const ITEM_SEARCH_BY_NAME = 3
/** PaymentMethodType */
const PAYMENT_METHOD_CREDIT_CARD = 1

// ─── Hosted checkout ─────────────────────────────────────────────────────────

export interface BeginRedirectParams {
  /** VAT-inclusive ILS amount. */
  amount: number
  /** Item name on the page and on the document. */
  description: string
  customer: {
    name: string
    email: string | null
    phone: string | null
    /** Our org id. Sumit files the card token under this customer. */
    externalIdentifier: string
  }
  /** Our checkout reference. Sumit echoes it back as `OG-ExternalIdentifier`. */
  externalIdentifier: string
  /** Sumit appends OG-PaymentID, OG-CustomerID, OG-ExternalIdentifier. */
  redirectUrl: string
  /** Sumit appends OG-ExternalIdentifier. */
  cancelRedirectUrl: string
  language: SumitLanguage
}

interface BeginRedirectData {
  RedirectURL?: string | null
}

/**
 * Opens a Sumit hosted payment page. The customer pays there; Sumit stores the
 * card as the customer's default payment method (PreventSavingPaymentMethod
 * is left false) — that is the token every later renewal charges.
 */
export async function beginSumitRedirect(p: BeginRedirectParams): Promise<{ redirectUrl: string }> {
  const path = '/billing/payments/beginredirect/'
  const data = await sumitPost<BeginRedirectData>(path, {
    Customer: {
      Name: p.customer.name,
      EmailAddress: p.customer.email,
      Phone: p.customer.phone,
      ExternalIdentifier: p.customer.externalIdentifier,
      SearchMode: CUSTOMER_SEARCH_BY_EXTERNAL_ID,
    },
    Items: [
      {
        Item: { Name: p.description, SearchMode: ITEM_SEARCH_BY_NAME },
        Quantity: 1,
        UnitPrice: p.amount,
      },
    ],
    // See ./pricing.ts — true while the company is VAT-exempt (the price sent
    // is the total), false once it registers for VAT (Sumit adds it on top).
    VATIncluded: PRICES_INCLUDE_VAT,
    DocumentType: SUMIT_DOCUMENT_TYPE.INVOICE_AND_RECEIPT,
    DocumentDescription: p.description,
    RedirectURL: p.redirectUrl,
    CancelRedirectURL: p.cancelRedirectUrl,
    ExternalIdentifier: p.externalIdentifier,
    // A subscription is not paid in installments.
    MaximumPayments: 0,
    ExpirationHours: SUMIT_CHECKOUT_EXPIRATION_HOURS,
    Language: SUMIT_LANGUAGE[p.language],
    UpdateCustomerOnSuccess: true,
    SendUpdateByEmailAddress: p.customer.email ?? undefined,
    PreventSavingPaymentMethod: false,
  })

  const redirectUrl = typeof data.RedirectURL === 'string' ? data.RedirectURL.trim() : ''
  if (!redirectUrl) {
    throw new SumitApiError(path, null, null, 'success without RedirectURL', 200)
  }
  return { redirectUrl }
}

// ─── Payments ────────────────────────────────────────────────────────────────

/** Authoritative record of one payment, by the id Sumit put in `OG-PaymentID`. */
export async function getSumitPayment(paymentId: string | number): Promise<SumitPayment> {
  const path = '/billing/payments/get/'
  const id = Number(paymentId)
  if (!Number.isInteger(id) || id <= 0) {
    throw new SumitApiError(path, null, null, `invalid PaymentID: ${String(paymentId)}`, 0)
  }
  const data = await sumitPost<{ Payment?: SumitPaymentRaw | null }>(path, { PaymentID: id })
  if (!data.Payment) {
    throw new SumitApiError(path, null, null, 'success without Payment', 200)
  }
  return normalizePayment(data.Payment)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Every payment in a date window, paged. Used by reconciliation to find a
 * completed checkout whose redirect never reached us.
 */
export async function listSumitPayments(p: {
  from: Date
  to: Date
  validOnly?: boolean
}): Promise<SumitPayment[]> {
  const path = '/billing/payments/list/'
  const out: SumitPayment[] = []
  let startIndex = 0
  // Hard stop so a misbehaving HasNextPage can never loop forever.
  for (let page = 0; page < 50; page++) {
    const data = await sumitPost<{ Payments?: SumitPaymentRaw[] | null; HasNextPage?: boolean }>(path, {
      Date_From: isoDate(p.from),
      Date_To: isoDate(p.to),
      Valid: p.validOnly ? true : undefined,
      StartIndex: startIndex,
    })
    const batch = data.Payments ?? []
    for (const raw of batch) out.push(normalizePayment(raw))
    if (!data.HasNextPage || batch.length === 0) break
    startIndex += batch.length
  }
  return out
}

// ─── Saved payment method ────────────────────────────────────────────────────

export interface SumitSavedCard {
  customerId: string | null
  token: string | null
  last4: string | null
  expiryMonth: number | null
  expiryYear: number | null
}

/**
 * The card Sumit holds for a customer, by Sumit id or by our org id
 * (`Customer.ExternalIdentifier` set at checkout). Null when the customer has
 * no saved card — Sumit reports that as a BusinessError.
 */
export async function getSumitPaymentMethodForCustomer(p: {
  customerId?: string | null
  externalIdentifier?: string | null
}): Promise<SumitSavedCard | null> {
  const path = '/billing/paymentmethods/getforcustomer/'
  const customer = p.customerId
    ? { ID: Number(p.customerId) }
    : { ExternalIdentifier: p.externalIdentifier, SearchMode: CUSTOMER_SEARCH_BY_EXTERNAL_ID }

  try {
    const data = await sumitPost<{ PaymentMethod?: SumitPaymentMethodRaw | null }>(path, {
      Customer: customer,
      IncludeInactive: false,
    })
    const pm = data.PaymentMethod
    if (!pm) return null
    return {
      customerId: pm.CustomerID != null ? String(pm.CustomerID) : (p.customerId ?? null),
      token: pm.CreditCard_Token?.trim() || null,
      last4: pm.CreditCard_LastDigits?.trim() || null,
      expiryMonth: typeof pm.CreditCard_ExpirationMonth === 'number' ? pm.CreditCard_ExpirationMonth : null,
      expiryYear: typeof pm.CreditCard_ExpirationYear === 'number' ? pm.CreditCard_ExpirationYear : null,
    }
  } catch (e) {
    if (e instanceof SumitApiError && e.isBusinessError) return null
    throw e
  }
}

/**
 * Sumit's own hosted page for one customer: the documents it issued them and,
 * with "עדכון אמצעי תשלום ע"י הלקוח" enabled in the clearing settings, the
 * form that replaces their saved card.
 *
 * This is how an owner whose card is about to expire fixes it themselves. No
 * follow-up is needed here: renewals charge by customer rather than by a
 * stored token (see src/lib/saas/renewal.ts), so the new card is used the
 * moment Sumit has it.
 *
 * Best-effort — any failure returns null and the caller omits the link.
 */
export async function getSumitCustomerHistoryUrl(customerId: string): Promise<string | null> {
  const path = '/accounting/customers/getdetailsurl/'
  try {
    const data = await sumitPost<{ CustomerHistoryURL?: string | null }>(path, {
      CustomerID: Number(customerId),
    })
    return data.CustomerHistoryURL?.trim() || null
  } catch (e) {
    console.warn('[sumit] customer page lookup failed', {
      customerId,
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

// ─── Charge a saved card ─────────────────────────────────────────────────────

export interface ChargeParams {
  /** Sumit customer id stored at activation. */
  customerId: string
  /** Saved card token. Null → Sumit charges the customer's default method. */
  token: string | null
  /** VAT-inclusive ILS amount. */
  amount: number
  description: string
  language: SumitLanguage
  /** Validate the card without moving money. The cutover dry run. */
  authoriseOnly?: boolean
  /** Sumit emails the customer the invoice/receipt it issues. */
  sendDocumentByEmail?: boolean
}

export type ChargeResult =
  | {
      ok: true
      payment: SumitPayment
      documentId: string | null
      documentNumber: string | null
      documentUrl: string | null
      customerId: string | null
    }
  | {
      ok: false
      payment: SumitPayment | null
      /** Sumit's own wording of the decline, for the failed invoice row. */
      reason: string
    }

interface ChargeData {
  Payment?: SumitPaymentRaw | null
  DocumentID?: number | null
  DocumentNumber?: number | null
  CustomerID?: number | null
  DocumentDownloadURL?: string | null
}

/**
 * Charges a customer's saved card. A decline is a *result*, not an exception:
 * Sumit reports it as BusinessError, or as Success with ValidPayment=false,
 * and both come back as `{ ok: false }`. Only outages, malformed responses and
 * TechnicalError throw — callers must not count those as attempts.
 */
export async function chargeSumitCustomer(p: ChargeParams): Promise<ChargeResult> {
  const path = '/billing/payments/charge/'
  const body: Record<string, unknown> = {
    Customer: { ID: Number(p.customerId) },
    Items: [
      {
        Item: { Name: p.description, SearchMode: ITEM_SEARCH_BY_NAME },
        Quantity: 1,
        UnitPrice: p.amount,
      },
    ],
    // See ./pricing.ts — true while the company is VAT-exempt (the price sent
    // is the total), false once it registers for VAT (Sumit adds it on top).
    VATIncluded: PRICES_INCLUDE_VAT,
    DocumentType: SUMIT_DOCUMENT_TYPE.INVOICE_AND_RECEIPT,
    DocumentDescription: p.description,
    DocumentLanguage: SUMIT_LANGUAGE[p.language],
    SendDocumentByEmail: p.sendDocumentByEmail ?? false,
    AuthoriseOnly: p.authoriseOnly ?? false,
    MaximumPayments: 0,
  }
  if (p.token) {
    body.PaymentMethod = { CreditCard_Token: p.token, Type: PAYMENT_METHOD_CREDIT_CARD }
  }

  let data: ChargeData
  try {
    data = await sumitPost<ChargeData>(path, body)
  } catch (e) {
    if (e instanceof SumitApiError && e.isBusinessError) {
      return { ok: false, payment: null, reason: e.userMessage ?? e.technicalDetails ?? 'BusinessError' }
    }
    throw e
  }

  const payment = data.Payment ? normalizePayment(data.Payment) : null
  if (!payment || !payment.valid) {
    return {
      ok: false,
      payment,
      reason: payment?.statusDescription ?? payment?.status ?? 'payment not valid',
    }
  }

  return {
    ok: true,
    payment,
    documentId: data.DocumentID != null ? String(data.DocumentID) : null,
    documentNumber: data.DocumentNumber != null ? String(data.DocumentNumber) : null,
    documentUrl: data.DocumentDownloadURL?.trim() || null,
    customerId: data.CustomerID != null ? String(data.CustomerID) : payment.customerId || null,
  }
}

// ─── Documents ───────────────────────────────────────────────────────────────

interface ListedDocument {
  DocumentID?: number | null
  DocumentNumber?: number | null
  CustomerID?: number | null
  Date?: string | null
  Type?: number | string | null
  DocumentDownloadURL?: string | null
}

/**
 * The invoice/receipt a hosted-checkout payment produced. Sumit's Payment
 * record does not carry a document id, so this lists the day's documents and
 * picks the newest one for that customer. Best-effort: any failure returns
 * null and activation proceeds without a document link.
 */
export async function findSumitDocumentForPayment(p: {
  customerId: string
  paidOn: Date
}): Promise<{ documentId: string; documentNumber: string | null; documentUrl: string | null } | null> {
  const path = '/accounting/documents/list/'
  try {
    const dayBefore = new Date(p.paidOn.getTime() - 86_400_000)
    const dayAfter = new Date(p.paidOn.getTime() + 86_400_000)
    const data = await sumitPost<{ Documents?: ListedDocument[] | null }>(path, {
      DocumentTypes: [SUMIT_DOCUMENT_TYPE.INVOICE_AND_RECEIPT],
      DateFrom: isoDate(dayBefore),
      DateTo: isoDate(dayAfter),
      IncludeDrafts: false,
      Paging: { StartIndex: 0, PageSize: 100 },
    })
    const mine = (data.Documents ?? []).filter(
      (d) => d.DocumentID != null && String(d.CustomerID) === p.customerId
    )
    if (mine.length === 0) return null
    mine.sort((a, b) => (b.DocumentID ?? 0) - (a.DocumentID ?? 0))
    const doc = mine[0]
    return {
      documentId: String(doc.DocumentID),
      documentNumber: doc.DocumentNumber != null ? String(doc.DocumentNumber) : null,
      documentUrl: doc.DocumentDownloadURL?.trim() || null,
    }
  } catch (e) {
    console.warn('[sumit] document lookup failed', {
      customerId: p.customerId,
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}
