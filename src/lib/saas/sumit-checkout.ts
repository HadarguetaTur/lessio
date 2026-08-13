/**
 * Sumit hosted checkout for SaaS subscriptions (test / production).
 *
 * Uses Sumit's hosted redirect flow:
 *   POST https://api.sumit.co.il/billing/payments/beginredirect/
 * which returns a RedirectURL. We send the customer there; on completion Sumit
 * redirects back to our `RedirectURL` with query params (`Valid`, `Result`,
 * `Token`, `Identifier`, `Auth`, `ID`). Activation is then confirmed
 * server-to-server via `confirmSumitPayment` (src/lib/saas/sumit.ts) — never by
 * trusting the redirect/webhook body.
 *
 * Receipts use {@link src/lib/receipts/sumit.ts}. Set SUMIT_CHECKOUT_MOCK=1 to
 * simulate checkout in-app locally, or SUMIT_CHECKOUT_ENDPOINT to override the
 * endpoint for a non-standard Sumit product.
 *
 * @see https://app.sumit.co.il/developers/api/
 */

const SUMIT_API_BASE = 'https://api.sumit.co.il'

export type SumitCheckoutParams = {
  companyId: string
  apiKey: string
  amount: number
  description: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  /** Our checkout reference — Sumit echoes it back as `Identifier` on redirect-return. */
  reference: string
  successUrl: string
  failureUrl: string
  /**
   * When `SUMIT_CHECKOUT_MOCK=1`, redirects to `${NEXT_PUBLIC_APP_URL}${mockPaymentPath}` instead of `/onboarding/mock-payment`.
   */
  mockPaymentPath?: string
}

interface SumitGenericResponse {
  Succeed?: boolean
  Status?: string | number
  ErrorMessage?: string
  UserErrorMessage?: string
  TechnicalErrorDetails?: string
  ReturnValue?: {
    RedirectURL?: string
    PaymentPageURL?: string
    Url?: string
    SessionID?: string
  }
  Data?: {
    RedirectURL?: string
    PaymentPageURL?: string
    Url?: string
  }
}

function pickRedirectUrl(json: SumitGenericResponse): string | null {
  const rv = json.ReturnValue
  const data = json.Data
  return (
    rv?.RedirectURL ??
    rv?.PaymentPageURL ??
    rv?.Url ??
    data?.RedirectURL ??
    data?.PaymentPageURL ??
    data?.Url ??
    null
  )
}

function errorMessage(json: SumitGenericResponse, fallback: string): string {
  return json.UserErrorMessage ?? json.ErrorMessage ?? json.TechnicalErrorDetails ?? fallback
}

/**
 * Returns the hosted payment-page URL, or an error if Sumit is not configured / the call failed.
 */
export async function createSumitHostedCheckoutUrl(
  params: SumitCheckoutParams
): Promise<{ url: string } | { error: string }> {
  if (process.env.SUMIT_CHECKOUT_MOCK === '1') {
    const base = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, '')
    const path = params.mockPaymentPath?.trim() || '/onboarding/mock-payment'
    const normalized = path.startsWith('/') ? path : `/${path}`
    // In-app simulated checkout page (not an instant redirect to dashboard).
    return { url: `${base}${normalized}` }
  }

  const endpoint =
    process.env.SUMIT_CHECKOUT_ENDPOINT?.trim() ||
    `${SUMIT_API_BASE}/billing/payments/beginredirect/`

  const body: Record<string, unknown> = {
    Credentials: {
      CompanyID: params.companyId,
      APIKey: params.apiKey,
    },
    // Echoed back as `Identifier` on redirect-return; also used for server-side confirmation lookup.
    Identifier: params.reference,
    ExternalReference: params.reference,
    RedirectURL: params.successUrl,
    Customer: {
      Name: params.customerName,
      EmailAddress: params.customerEmail ?? null,
      Phone: params.customerPhone ?? null,
      // SearchMode 0 lets Sumit create/find the customer so a reusable card token can be stored on it.
      SearchMode: 0,
    },
    Items: [
      {
        Item: { Name: params.description, SearchMode: 0 },
        Quantity: 1,
        UnitPrice: params.amount,
      },
    ],
    VATIncluded: true,
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    let json: SumitGenericResponse = {}
    try {
      json = JSON.parse(text) as SumitGenericResponse
    } catch {
      return { error: `[sumit-checkout] Non-JSON response (${res.status}): ${text.slice(0, 200)}` }
    }

    if (!res.ok) {
      return { error: errorMessage(json, `[sumit-checkout] HTTP ${res.status}`) }
    }

    if (json.Succeed === false) {
      return { error: errorMessage(json, 'Sumit checkout rejected') }
    }

    const url = pickRedirectUrl(json)
    if (!url) {
      return { error: errorMessage(json, 'Sumit did not return a payment URL') }
    }

    return { url }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: `[sumit-checkout] ${msg}` }
  }
}

export function getSumitCredentialsFromEnv(): { companyId: string; apiKey: string } | null {
  const companyId = process.env.SUMIT_COMPANY_ID?.trim()
  const apiKey = process.env.SUMIT_API_KEY?.trim()
  if (!companyId || !apiKey) return null
  return { companyId, apiKey }
}
