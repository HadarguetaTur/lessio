/**
 * PayBox payment adapter.
 * Per /docs/sprint-15-scope.md § Story 8.
 *
 * PayBox API: https://developer.payboxapp.com
 * Generates a hosted payment page link.
 *
 * NOTE: Exact endpoint paths, request/response shapes, and webhook field names
 * must be verified against the PayBox developer portal during go-live.
 * The contract below is based on the documented API structure.
 *
 * Config fields: apiKey, secret, merchantId
 */

import type { PaymentProvider } from './index'

export interface PayBoxConfig {
  apiKey:     string
  secret:     string
  merchantId: string
}

const PAYBOX_API_BASE = 'https://api.payboxapp.com/api/v1'

interface PayBoxPaymentResponse {
  transactionId?: string
  paymentUrl?: string
  chargeUrl?: string
  url?: string
  id?: string
  paymentId?: string
}

export class PayBoxProvider implements PaymentProvider {
  constructor(private config: PayBoxConfig) {}

  async createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
  }): Promise<{ url: string; reference: string }> {
    const { chargeId, amount, description } = params
    const { apiKey, secret, merchantId } = this.config

    const body = {
      merchantId,
      amount,
      currency: 'ILS',
      description,
      reference: chargeId,
    }

    const res = await fetch(`${PAYBOX_API_BASE}/charges/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'X-Api-Secret': secret,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[paybox] API HTTP error ${res.status}: ${text}`)
    }

    const json = (await res.json()) as PayBoxPaymentResponse

    const url = json.paymentUrl ?? json.chargeUrl ?? json.url
    const reference = json.transactionId ?? json.paymentId ?? json.id

    if (!url || !reference) {
      throw new Error(`[paybox] API response missing payment URL or reference id: ${JSON.stringify(json)}`)
    }

    return { url, reference }
  }
}
