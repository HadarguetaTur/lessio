/**
 * PayPlus payment provider adapter.
 * Per /docs/sprint-8-scope.md § Story 2 (multi-provider).
 *
 * API docs: https://docs.payplus.co.il/reference/post_paymentpages-generatelink
 * Endpoint: POST https://restapi.payplus.co.il/api/v1.0/PaymentPages/generateLink
 *
 * Authentication: api-key + secret-key HTTP headers.
 * Config comes decrypted from the DB at call time — never from env vars.
 *
 * Reference mapping:
 *   payment_reference → page_request_uid (unique UUID PayPlus assigns to each link)
 *   payment_link      → payment_page_link (the hosted payment page URL)
 *
 * Webhook: PayPlus POSTs to refURL_callback after payment completion.
 * Route: POST /api/payments/payplus
 */

import type { PaymentProvider } from './index'

export interface PayPlusConfig {
  apiKey: string
  secretKey: string
  pageUid: string
}

const PAYPLUS_API_URL = 'https://restapi.payplus.co.il/api/v1.0/PaymentPages/generateLink'

interface PayPlusApiResponse {
  results: {
    status: string
    code: number
    description: string
  }
  data?: {
    page_request_uid: string
    payment_page_link: string
  }
}

export class PayPlusProvider implements PaymentProvider {
  private config: PayPlusConfig

  constructor(config: PayPlusConfig) {
    this.config = config
  }

  async createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
  }): Promise<{ url: string; reference: string }> {
    const { chargeId, amount, description, orgId } = params
    const { apiKey, secretKey, pageUid } = this.config

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const callbackUrl = `${appUrl}/api/payments/payplus`

    const body = {
      payment_page_uid: pageUid,
      charge_method: 1, // J4 — regular charge
      amount,
      currency_code: 'ILS',
      sendEmailApproval: false,
      sendEmailFailure: false,
      // more_info stores our internal chargeId for traceability (logged but not used for lookup)
      more_info: chargeId,
      more_info_2: orgId,
      refURL_callback: callbackUrl,
    }

    const res = await fetch(PAYPLUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        'secret-key': secretKey,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[payplus] API HTTP error ${res.status}: ${text}`)
    }

    const json = (await res.json()) as PayPlusApiResponse

    if (json.results.code !== 0 || json.results.status !== 'success') {
      throw new Error(
        `[payplus] API error code ${json.results.code}: ${json.results.description}`
      )
    }

    if (!json.data?.page_request_uid || !json.data?.payment_page_link) {
      throw new Error(
        `[payplus] API response missing page_request_uid or payment_page_link: ${JSON.stringify(json)}`
      )
    }

    return {
      url: json.data.payment_page_link,
      reference: json.data.page_request_uid,
    }
  }
}
