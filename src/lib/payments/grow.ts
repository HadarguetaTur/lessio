/**
 * Grow (formerly Meshulam / משולם) payment adapter.
 *
 * API docs: https://developers.grow.business/
 * Endpoint: POST {base}/createPaymentProcess — returns a hosted payment page URL.
 *
 * Chosen over Grow's newer CreatePaymentLink call because createPaymentProcess
 * hands back the URL in the response; CreatePaymentLink is built around Grow
 * sending the link itself over SMS/email, and Lessio sends it over WhatsApp.
 *
 * Two things set Grow apart from the other adapters here:
 *   - Requests are multipart/form-data, not JSON, and reject special characters
 *     in parameter values (see sanitize() below).
 *   - Webhooks carry no HMAC signature. Authenticity rests on processToken — a
 *     long random string only Grow and this server ever see — plus the
 *     approveTransaction round-trip in acknowledgeWebhook().
 *
 * Reference mapping:
 *   payment_reference → processToken
 *   payment_link      → data.url (Grow's hosted payment page)
 *
 * Webhook: Grow POSTs form-encoded to notifyUrl → /api/payments/grow
 *
 * GO-LIVE: credentials (userId, pageCode, apiKey) and webhook activation both
 * come from Grow support. Verify against a live merchant account before the
 * first org goes live.
 */

import type { PaymentProvider, PaymentPayer } from './index'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { toIsraeliLocalPhone } from '@/lib/phone'

export interface GrowConfig {
  userId: string
  pageCode: string
  apiKey: string
}

/** Production base. Override with GROW_API_BASE_URL to point at the sandbox. */
const GROW_API_BASE_DEFAULT = 'https://secure.meshulam.co.il/api/light/server/1.0'

/**
 * Grow reports the outcome twice: a numeric statusCode and a Hebrew status
 * text. Both are wire values received from Grow — never shown to anyone — so
 * they belong here rather than in the message catalogs.
 */
const GROW_STATUS_CODE_PAID = '2'
// eslint-disable-next-line no-restricted-syntax -- protocol value from Grow's webhook, not display copy
const GROW_STATUS_TEXT_PAID = 'שולם'

interface GrowApiResponse {
  status?: number
  err?: { message?: string; code?: string | number } | string
  data?: {
    url?: string
    processId?: string | number
    processToken?: string
  }
}

/**
 * Grow rejects "special characters" in request parameters without saying which.
 * Keep Hebrew, Latin, digits, whitespace and the few separators that appear in
 * a charge description, drop the rest.
 */
function sanitize(value: string): string {
  return value
    .replace(/[^֐-׿a-zA-Z0-9\s.,\-/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function growApiBase(): string {
  return (process.env.GROW_API_BASE_URL?.trim() || GROW_API_BASE_DEFAULT).replace(/\/+$/, '')
}

/**
 * Grow's page fields are validated on arrival: it wants a full name of at least
 * two words and an Israeli mobile in local (05…) form. Anything it would reject
 * is left out so the parent can type it on the page instead — sending a bad
 * value fails the whole request.
 */
function payerFields(payer: PaymentPayer | undefined): Record<string, string> {
  const fields: Record<string, string> = {}

  const fullName = sanitize(payer?.fullName ?? '')
  if (fullName.split(' ').filter(Boolean).length >= 2) {
    fields['pageField[fullName]'] = fullName
  }

  const phone = toIsraeliLocalPhone(payer?.phone)
  if (phone) {
    fields['pageField[phone]'] = phone
  }

  return fields
}

function errorMessage(err: GrowApiResponse['err']): string {
  if (!err) return 'unknown error'
  if (typeof err === 'string') return err
  return err.message ?? String(err.code ?? 'unknown error')
}

export class GrowProvider implements PaymentProvider {
  constructor(private config: GrowConfig) {}

  async createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
    payer?: PaymentPayer
  }): Promise<{ url: string; reference: string }> {
    const { chargeId, amount, description, orgId, payer } = params
    const baseUrl = getShareableBaseUrl()

    const form = new FormData()
    form.append('userId', this.config.userId)
    form.append('pageCode', this.config.pageCode)
    form.append('sum', amount.toFixed(2))
    form.append('description', sanitize(description))
    form.append('chargeType', '1') // regular charge
    form.append('notifyUrl', `${baseUrl}/api/payments/grow`)
    // Grow issues the invoice itself when the org has its invoicing product on,
    // and announces it separately from the payment.
    form.append('invoiceNotifyUrl', `${baseUrl}/api/payments/grow/invoice`)
    form.append('successUrl', `${baseUrl}/portal/${orgId}/payments?payment=success`)
    form.append('cancelUrl', `${baseUrl}/portal/${orgId}/payments?payment=cancelled`)
    // Custom fields echo back in the webhook — traceability only, not the
    // reconciliation key (that is processToken).
    form.append('cField1', chargeId)
    form.append('cField2', orgId)
    for (const [name, value] of Object.entries(payerFields(payer))) {
      form.append(name, value)
    }
    // transactionTypes is deliberately not sent: the payment methods offered are
    // whatever the org enabled on this page in its own Grow account.

    const res = await fetch(`${growApiBase()}/createPaymentProcess`, {
      method: 'POST',
      headers: { 'x-api-key': this.config.apiKey },
      body: form,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[grow] API HTTP error ${res.status}: ${text}`)
    }

    const json = (await res.json()) as GrowApiResponse

    if (json.status !== 1) {
      throw new Error(`[grow] API error: ${errorMessage(json.err)}`)
    }

    if (!json.data?.url || !json.data?.processToken) {
      throw new Error(
        `[grow] API response missing url or processToken: ${JSON.stringify(json)}`
      )
    }

    return {
      url: json.data.url,
      reference: json.data.processToken,
    }
  }

  /**
   * Grow's settlement path: approveTransaction, which is both the confirmation
   * and the acknowledgement.
   *
   * Grow signs nothing, so a callback body on its own proves only that someone
   * knows a processToken. approveTransaction proves more: it is a call made
   * with the org's own API key, and Grow accepts it only for a (processId,
   * processToken) pair that really belongs to this merchant and is really
   * awaiting approval. A forged callback fails it, so it — not the body — is
   * what authorises the mutation.
   *
   * It is also the call Grow requires before some flows (Bit especially)
   * actually settle, which is why it runs before the charge is written rather
   * than after: a Grow retry re-runs it, whereas a payment we recorded without
   * approving would never be collected at all.
   *
   * Returns false rather than throwing on every failure — the route treats a
   * false as "do not touch the ledger", which is the correct outcome for a
   * network error too.
   */
  async confirmTransaction(params: {
    reference: string
    expectedAmount: number
    chargeIds: string[]
    body?: Record<string, string>
  }): Promise<boolean> {
    const processId = params.body?.processId
    const processToken = params.body?.processToken

    // The token in the body must be the reference the charge was minted with:
    // approveTransaction is scoped to the merchant, not to this payment.
    if (!processId || !processToken || processToken !== params.reference) {
      console.error('[grow] Cannot approve transaction — callback has no matching process identifiers')
      return false
    }

    const form = new FormData()
    form.append('userId', this.config.userId)
    form.append('pageCode', this.config.pageCode)
    form.append('processId', processId)
    form.append('processToken', processToken)

    let res: Response
    try {
      res = await fetch(`${growApiBase()}/approveTransaction`, {
        method: 'POST',
        headers: { 'x-api-key': this.config.apiKey },
        body: form,
      })
    } catch (err) {
      console.error('[grow] approveTransaction request failed', { err: String(err) })
      return false
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[grow] approveTransaction HTTP error', { status: res.status, body: text })
      return false
    }

    const json = (await res.json().catch(() => null)) as GrowApiResponse | null
    if (!json || json.status !== 1) {
      console.error('[grow] approveTransaction rejected', {
        err: json ? errorMessage(json.err) : 'unparseable response',
      })
      return false
    }

    return true
  }
}

/**
 * Every identifier Grow hands us for the transaction behind a payment.
 *
 * Grow's invoice webhook identifies the transaction by `transactionCode`, and
 * the docs never say which of these it equals — so we keep all of them and let
 * the invoice match against the set rather than betting on one.
 */
export function growWebhookTransactionIds(body: Record<string, string>): string[] {
  return [body.transactionId, body.transactionToken, body.asmachta].filter(
    (value): value is string => Boolean(value)
  )
}

/**
 * Parses Grow's invoice webhook: { transactionCode, invoiceNumber, invoiceUrl }.
 * Returns null unless it carries both a transaction to match on and a document
 * to record.
 */
export function parseGrowInvoiceWebhookBody(
  body: Record<string, string>
): { transactionCode: string; invoiceUrl: string; invoiceNumber: string | null } | null {
  const transactionCode = body.transactionCode
  const invoiceUrl = body.invoiceUrl
  if (!transactionCode || !invoiceUrl) return null
  return { transactionCode, invoiceUrl, invoiceNumber: body.invoiceNumber || null }
}

/**
 * Extracts the reconciliation reference and outcome from a Grow webhook body.
 * Exported so the registry entry and its tests share one definition.
 */
export function parseGrowWebhookBody(
  body: Record<string, string>
): { reference: string; isSuccess: boolean } | null {
  const reference = body.processToken
  if (!reference) return null
  const isSuccess =
    body.statusCode === GROW_STATUS_CODE_PAID || body.status === GROW_STATUS_TEXT_PAID
  return { reference, isSuccess }
}
