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
import { getShareableBaseUrl } from '@/lib/url/appUrl'

export interface CardcomConfig {
  terminal: string
  apiName: string
  apiPassword: string
}

const CARDCOM_API_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create'
const CARDCOM_RESULT_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult'

interface CardcomApiResponse {
  ResponseCode: number
  Description?: string
  LowProfileId?: string
  Url?: string
}

interface CardcomResultResponse {
  ResponseCode: number
  TerminalNumber?: number
  LowProfileId?: string
  ReturnValue?: string
  Operation?: string
  TranzactionInfo?: {
    ResponseCode?: number
    TerminalNumber?: number
    Amount?: number
    CoinId?: number
    IsRefund?: boolean
  } | null
}

export class CardcomProvider implements PaymentProvider {
  private config: CardcomConfig

  constructor(config: CardcomConfig) {
    this.config = config
  }

  async confirmTransaction(params: {
    reference: string
    expectedAmount: number
    chargeIds: string[]
  }): Promise<boolean> {
    const res = await fetch(CARDCOM_RESULT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        TerminalNumber: Number(this.config.terminal),
        ApiName: this.config.apiName,
        LowProfileId: params.reference,
      }),
      cache: 'no-store',
    })
    if (!res.ok) return false
    const result = (await res.json()) as CardcomResultResponse
    const transaction = result.TranzactionInfo
    return result.ResponseCode === 0 &&
      result.LowProfileId?.toLowerCase() === params.reference.toLowerCase() &&
      result.Operation === 'ChargeOnly' &&
      params.chargeIds.includes(result.ReturnValue ?? '') &&
      transaction?.ResponseCode === 0 &&
      transaction.TerminalNumber === Number(this.config.terminal) &&
      transaction.CoinId === 1 &&
      transaction.IsRefund !== true &&
      Math.round(Number(transaction.Amount) * 100) === Math.round(params.expectedAmount * 100)
  }

  async createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
  }): Promise<{ url: string; reference: string }> {
    const { chargeId, amount, description } = params
    const { terminal, apiName, apiPassword } = this.config

    const baseUrl = getShareableBaseUrl()
    const body = {
      TerminalNumber: Number(terminal),
      ApiName: apiName,
      Operation: 'ChargeOnly',
      Amount: amount,
      ISOCoinId: 1, // ILS
      ReturnValue: chargeId,
      ProductName: description,
      WebHookUrl: `${baseUrl}/api/payments/cardcom`,
      SuccessRedirectUrl: `${baseUrl}/portal/${params.orgId}/payments?payment=success`,
      FailedRedirectUrl: `${baseUrl}/portal/${params.orgId}/payments?payment=cancelled`,
      AdvancedDefinition: { ApiPassword: apiPassword, MaxNumOfPayments: 1 },
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

    if (!json.LowProfileId || !json.Url) {
      throw new Error(
        `[cardcom] API response missing LowProfileId or Url: ${JSON.stringify(json)}`
      )
    }

    return {
      url: json.Url,
      reference: json.LowProfileId,
    }
  }
}
