/**
 * Sumit response parsing — pure, no I/O, no imports.
 *
 * Every Sumit endpoint answers with the same envelope:
 *
 *   { Status, UserErrorMessage, TechnicalErrorDetails, Data }
 *
 * where Status is Success (0) / BusinessError (1) / TechnicalError (2). The
 * enum is declared as a string in the OpenAPI spec ("Success (0)") but the API
 * serialises it as a number; both are accepted here so a change on Sumit's
 * side cannot turn every response into a false success. HTTP 200 says nothing
 * about the outcome — a declined card is a 200 with Status 1.
 *
 * Verified against https://api.sumit.co.il/swagger/v1/swagger.json (02.09.2026).
 * The previous client checked a `Succeed` field and read `ReturnValue`; neither
 * exists, which is why it could never see a decline.
 */

export type SumitStatusCode = 0 | 1 | 2

export type SumitStatusRaw = number | string | null | undefined

export interface SumitEnvelope<T> {
  Status?: SumitStatusRaw
  UserErrorMessage?: string | null
  TechnicalErrorDetails?: string | null
  Data?: T | null
}

/** "Success (0)" | 0 | "0" → 0; "BusinessError (1)" | 1 → 1; "TechnicalError (2)" | 2 → 2; anything else → null. */
export function sumitStatusCode(raw: SumitStatusRaw): SumitStatusCode | null {
  if (raw === 0 || raw === 1 || raw === 2) return raw
  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (/^success\b/i.test(trimmed)) return 0
  if (/^businesserror\b/i.test(trimmed)) return 1
  if (/^technicalerror\b/i.test(trimmed)) return 2

  const inParens = /\((\d)\)\s*$/.exec(trimmed)
  const digit = inParens ? inParens[1] : /^\d$/.test(trimmed) ? trimmed : null
  if (digit === '0') return 0
  if (digit === '1') return 1
  if (digit === '2') return 2
  return null
}

export class SumitApiError extends Error {
  constructor(
    readonly path: string,
    /** 1 = BusinessError, 2 = TechnicalError, null = malformed / transport. */
    readonly code: 1 | 2 | null,
    readonly userMessage: string | null,
    readonly technicalDetails: string | null,
    readonly httpStatus: number
  ) {
    super(
      `[sumit] ${path} failed (HTTP ${httpStatus}, status ${code ?? 'unknown'}): ${
        userMessage ?? technicalDetails ?? 'no message'
      }`
    )
    this.name = 'SumitApiError'
  }

  /** A business refusal (declined card, unknown customer) as opposed to an outage. */
  get isBusinessError(): boolean {
    return this.code === 1
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Returns `Data` when the envelope reports success, otherwise throws
 * SumitApiError. A success envelope with no Data object is also an error —
 * every endpoint we call returns one.
 */
export function unwrapSumit<T>(path: string, httpStatus: number, json: unknown): T {
  if (!isRecord(json)) {
    throw new SumitApiError(path, null, null, 'response is not a JSON object', httpStatus)
  }
  const env = json as SumitEnvelope<T>
  const code = sumitStatusCode(env.Status)
  const userMessage = typeof env.UserErrorMessage === 'string' ? env.UserErrorMessage : null
  const technical = typeof env.TechnicalErrorDetails === 'string' ? env.TechnicalErrorDetails : null

  if (code !== 0) {
    throw new SumitApiError(path, code === 1 || code === 2 ? code : null, userMessage, technical, httpStatus)
  }
  if (!isRecord(env.Data)) {
    throw new SumitApiError(path, null, userMessage, technical ?? 'success envelope without Data', httpStatus)
  }
  return env.Data as T
}

// ─── Payment records ──────────────────────────────────────────────────────────

export interface SumitPaymentMethodRaw {
  ID?: number | null
  CustomerID?: number | null
  CreditCard_Token?: string | null
  CreditCard_LastDigits?: string | null
  CreditCard_ExpirationMonth?: number | null
  CreditCard_ExpirationYear?: number | null
  Type?: number | string | null
}

/** `OfficeGuy.Apps.Billing.MVC.API.Typed.Payment` as Sumit returns it. */
export interface SumitPaymentRaw {
  ID: number
  CustomerID: number
  Date?: string | null
  ValidPayment: boolean
  Status?: string | null
  StatusDescription?: string | null
  Amount: number
  PaymentMethod?: SumitPaymentMethodRaw | null
  AuthNumber?: string | null
}

export interface SumitPayment {
  id: string
  customerId: string
  /** Sumit's Date as given; offset semantics are not documented. */
  date: string | null
  valid: boolean
  status: string | null
  statusDescription: string | null
  amount: number
  token: string | null
  last4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  authNumber: string | null
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

export function normalizePayment(raw: SumitPaymentRaw): SumitPayment {
  const pm = raw.PaymentMethod ?? null
  return {
    id: str(raw.ID) ?? '',
    customerId: str(raw.CustomerID) ?? '',
    date: str(raw.Date),
    valid: raw.ValidPayment === true,
    status: str(raw.Status),
    statusDescription: str(raw.StatusDescription),
    amount: typeof raw.Amount === 'number' ? raw.Amount : 0,
    token: pm ? str(pm.CreditCard_Token) : null,
    last4: pm ? str(pm.CreditCard_LastDigits) : null,
    expiryMonth: pm ? int(pm.CreditCard_ExpirationMonth) : null,
    expiryYear: pm ? int(pm.CreditCard_ExpirationYear) : null,
    authNumber: str(raw.AuthNumber),
  }
}

/**
 * A charge is declined when the envelope is not a success OR Sumit answered
 * success with a payment it marks invalid. Both happen in practice.
 */
export function isChargeDeclined(code: SumitStatusCode | null, payment: SumitPayment | null): boolean {
  if (code !== 0) return true
  return payment == null || payment.valid !== true
}
