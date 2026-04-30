/**
 * Sumit hosted checkout for SaaS subscriptions (test / production).
 *
 * Receipts use {@link src/lib/receipts/sumit.ts}. Payment-page endpoints vary by
 * Sumit product; configure SUMIT_CHECKOUT_ENDPOINT or use SUMIT_CHECKOUT_MOCK=1 locally.
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
  ErrorMessage?: string
  ReturnValue?: {
    PaymentPageURL?: string
    Url?: string
    SessionID?: string
  }
}

function pickPaymentUrl(json: SumitGenericResponse): string | null {
  const rv = json.ReturnValue
  if (!rv) return null
  return rv.PaymentPageURL ?? rv.Url ?? null
}

/**
 * Returns hosted payment URL or null if Sumit is not configured / call failed.
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
    `${SUMIT_API_BASE}/paymentpage/create`

  const body: Record<string, unknown> = {
    Credentials: {
      CompanyID: params.companyId,
      APIKey: params.apiKey,
    },
    Reference: params.reference,
    Description: params.description,
    Amount: params.amount,
    Currency: 'ILS',
    CustomerName: params.customerName,
    CustomerEmail: params.customerEmail ?? '',
    CustomerPhone: params.customerPhone ?? '',
    SuccessURL: params.successUrl,
    FailureURL: params.failureUrl,
    // Sumit may expect different keys per integration — adjust when finalizing prod API.
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
      return {
        error: json.ErrorMessage ?? `[sumit-checkout] HTTP ${res.status}`,
      }
    }

    if (json.Succeed === false) {
      return { error: json.ErrorMessage ?? 'Sumit checkout rejected' }
    }

    const url = pickPaymentUrl(json)
    if (!url) {
      return { error: json.ErrorMessage ?? 'Sumit did not return a payment URL' }
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
