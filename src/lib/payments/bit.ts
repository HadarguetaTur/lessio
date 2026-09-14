/**
 * Bit Business payment adapter.
 * Per /docs/sprint-15-scope.md § Story 7.
 *
 * Bit Business API: https://developer.bitpay.co.il
 * Generates a payment request link that the parent opens in the Bit app.
 *
 * ⚠ UNVERIFIED WIRE CONTRACT — DO NOT TREAT AS WORKING.
 *
 * Endpoint paths, request/response field names, the webhook's field names and
 * its HMAC scheme (algorithm, encoding, header name) are all inferred, not
 * confirmed against a live Bit Business account. This is the same shape as the
 * Sumit client that "was written to a guessed contract and silently treated
 * every decline as a success" (see CLAUDE.md). Verify against the Bit Business
 * developer portal before any org is allowed to select this provider; do not
 * "fix" a field name by guessing a different one.
 *
 * What IS verified in our own code, and is NOT broken:
 *   - `reference: chargeId` at the createPaymentLink body is the id we SEND to
 *     Bit, not the reference we store. The stored reference is Bit's own
 *     `paymentId ?? transactionId ?? id` from the response, and
 *     registry.parseWebhookBody reads `transactionId || paymentId || externalId`
 *     back off the callback. Those agree — provided Bit really echoes its own
 *     id under one of those names, which is exactly the unverified part.
 *   - There is no `confirmTransaction`, so the signed webhook is the only
 *     settlement path. createPaymentLink now refuses to mint a link in
 *     production when BIT_WEBHOOK_HMAC_SECRET is unset, because without it
 *     /api/payments/bit rejects every callback and the parent's money vanishes
 *     into a log line.
 *
 * Config fields: apiKey, secret, merchantId
 */

import type { PaymentProvider } from './index'
import { assertWebhookSettlementConfigured } from './webhook-verify'

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

    // Bit has no confirmTransaction: the signed webhook is the ONLY way a
    // payment made through this link can ever settle. See the header note.
    assertWebhookSettlementConfigured(
      process.env.BIT_WEBHOOK_HMAC_SECRET,
      'bit',
      'BIT_WEBHOOK_HMAC_SECRET'
    )

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
