/**
 * Bit Business payment adapter.
 * Per /docs/sprint-15-scope.md § Story 7.
 *
 * Bit Business API: https://developer.bitpay.co.il
 * Generates a payment request link that the parent opens in the Bit app.
 *
 * NOTE: Exact endpoint paths, request/response shapes, and webhook field names
 * must be verified against the Bit Business developer portal during go-live.
 * The contract below is based on the documented API structure.
 *
 * Config fields: apiKey, secret, merchantId
 */

import type { PaymentProvider } from './index'

export interface BitConfig {
  apiKey:     string
  secret:     string
  merchantId: string
}

const BIT_API_BASE = 'https://api.bitpay.co.il/api/v1'

interface BitPaymentResponse {
  paymentId?: string
  paymentUrl?: string
  transactionId?: string
  url?: string
  id?: string
}

export class BitProvider implements PaymentProvider {
  constructor(private config: BitConfig) {}

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

    const res = await fetch(`${BIT_API_BASE}/payments`, {
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
      throw new Error(`[bit] API HTTP error ${res.status}: ${text}`)
    }

    const json = (await res.json()) as BitPaymentResponse

    const url = json.paymentUrl ?? json.url
    const reference = json.paymentId ?? json.transactionId ?? json.id

    if (!url || !reference) {
      throw new Error(`[bit] API response missing payment URL or reference id: ${JSON.stringify(json)}`)
    }

    return { url, reference }
  }
}
