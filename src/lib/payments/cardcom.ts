/**
 * Cardcom payment provider adapter.
 * Per /docs/sprint-8-scope.md § Story 2.
 *
 * Calls the Cardcom J5 LowProfile API to create a hosted payment page link.
 * Config comes decrypted from the DB at call time — never from env vars.
 *
 * Cardcom API docs: https://developers.cardcom.solutions/
 * Endpoint: POST https://secure.cardcom.solutions/api/v11/LowProfile/Create
 */

import type { PaymentProvider } from './index'

export interface CardcomConfig {
  terminal: string
  apiName: string
  apiPassword: string
}

const CARDCOM_API_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create'

interface CardcomApiResponse {
  ResponseCode: number
  Description?: string
  LowProfileCode?: string
  url?: string
}

export class CardcomProvider implements PaymentProvider {
  private config: CardcomConfig

  constructor(config: CardcomConfig) {
    this.config = config
  }

  async createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
  }): Promise<{ url: string; reference: string }> {
    const { chargeId, amount, description } = params
    const { terminal, apiName, apiPassword } = this.config

    const body = {
      TerminalNumber: terminal,
      ApiName: apiName,
      ApiPassword: apiPassword,
      Amount: amount,
      Currency: 1, // ILS
      Description: description,
      ReturnValue: chargeId,
      MaxPayments: 1,
    }

    const res = await fetch(CARDCOM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[cardcom] API HTTP error ${res.status}: ${text}`)
    }

    const json = (await res.json()) as CardcomApiResponse

    if (json.ResponseCode !== 0) {
      throw new Error(
        `[cardcom] API returned error code ${json.ResponseCode}: ${json.Description ?? 'unknown'}`
      )
    }

    if (!json.LowProfileCode || !json.url) {
      throw new Error(
        `[cardcom] API response missing LowProfileCode or url: ${JSON.stringify(json)}`
      )
    }

    return {
      url: json.url,
      reference: json.LowProfileCode,
    }
  }
}
