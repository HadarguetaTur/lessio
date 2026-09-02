/**
 * Sumit hosted checkout for SaaS subscriptions.
 *
 * Thin wrapper over `beginSumitRedirect` (./sumit.ts) that keeps the
 * `{ url } | { error }` contract the checkout actions use, and the local mock:
 * with SUMIT_CHECKOUT_MOCK=1 the "payment page" is our own
 * /onboarding/mock-payment (or `mockPaymentPath`), so the whole flow can be
 * walked without a Sumit company.
 *
 * On completion Sumit sends the customer to `successUrl` with
 * `OG-PaymentID`, `OG-CustomerID` and `OG-ExternalIdentifier` appended, or to
 * `cancelUrl` with `OG-ExternalIdentifier`. Activation is decided by looking
 * the payment up at Sumit (src/lib/saas/checkoutReturn.ts) — never by trusting
 * the query string.
 */

import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { beginSumitRedirect, SumitApiError, type SumitLanguage } from './sumit'

export type SumitCheckoutParams = {
  /** Filed on the Sumit customer as ExternalIdentifier, so the saved card can be found by org. */
  orgId: string
  amount: number
  description: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  /** Our checkout reference — echoed back as `OG-ExternalIdentifier`. */
  reference: string
  successUrl: string
  cancelUrl: string
  language: SumitLanguage
  /** SUMIT_CHECKOUT_MOCK=1 only: in-app page to stand in for Sumit's. */
  mockPaymentPath?: string
}

export function isSumitCheckoutMock(): boolean {
  return process.env.SUMIT_CHECKOUT_MOCK === '1'
}

/**
 * Returns the hosted payment-page URL, or an error string when Sumit refused
 * or is unreachable. Never throws.
 */
export async function createSumitHostedCheckoutUrl(
  params: SumitCheckoutParams
): Promise<{ url: string } | { error: string }> {
  if (isSumitCheckoutMock()) {
    const base = getShareableBaseUrl()
    const path = params.mockPaymentPath?.trim() || '/onboarding/mock-payment'
    const normalized = path.startsWith('/') ? path : `/${path}`
    // In-app simulated checkout page (not an instant redirect to dashboard).
    return { url: `${base}${normalized}` }
  }

  try {
    const { redirectUrl } = await beginSumitRedirect({
      amount: params.amount,
      description: params.description,
      customer: {
        name: params.customerName,
        email: params.customerEmail,
        phone: params.customerPhone,
        externalIdentifier: params.orgId,
      },
      externalIdentifier: params.reference,
      redirectUrl: params.successUrl,
      cancelRedirectUrl: params.cancelUrl,
      language: params.language,
    })
    return { url: redirectUrl }
  } catch (e) {
    if (e instanceof SumitApiError) {
      console.error('[sumit-checkout] beginredirect failed', {
        orgId: params.orgId,
        code: e.code,
        httpStatus: e.httpStatus,
        userMessage: e.userMessage,
        technicalDetails: e.technicalDetails,
      })
      return { error: e.userMessage ?? e.message }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { error: `[sumit-checkout] ${msg}` }
  }
}
