/**
 * Automation-webhook payment adapter (Make, n8n, or anything that answers an
 * HTTP POST synchronously).
 *
 * Unlike every other adapter here, this one does not know which processor is on
 * the other side. Lessio POSTs a payment request to a URL the org controls, and
 * whatever scenario lives there — Make's "Custom webhook" → processor module →
 * "Webhook response", or n8n's "Webhook" → … → "Respond to Webhook" — hands back
 * a checkout URL.
 *
 * Why this exists: some processors charge for direct API access while their
 * automation-platform connector is included. Grow is the case it was built for
 * (they confirmed the API tier's monthly fee does not cover the Make route), and
 * the shape generalises to any processor an org can reach from a scenario.
 *
 * Reference mapping:
 *   payment_reference → mk_<uuid>, minted HERE, not returned by the scenario
 *   payment_link      → the url the scenario responds with
 *
 * Minting the reference locally is the same reasoning as Grow's processToken
 * (see registry.ts): it is unique, high-entropy, and known only to Lessio and
 * the org's own scenario, so it identifies the charge on the way back without
 * trusting the remote to generate anything.
 *
 * Settlement: the scenario reports the payment through
 * POST /api/v1/charges/{id}/payments with the org's API key. That path
 * authenticates properly, which the synchronous verifyWebhookRequest hook cannot
 * — it has no way to await a per-org secret. POST /api/payments/make is accepted
 * as a fallback for orgs that would rather post a webhook body (see
 * parseMakeWebhookBody), but it is authenticated only by the reference.
 */

import { randomUUID } from 'crypto'
import type { PaymentProvider, PaymentPayer } from './index'

export interface MakeConfig {
  webhookUrl: string
}

/**
 * A cold Make or n8n scenario takes a few seconds to spin up before the first
 * module runs, so the timeout is generous. It still has to be bounded: without
 * it a hung scenario would hold the Server Action open until the platform killed
 * the request, and the person who pressed "send payment request" would watch a
 * spinner with no error.
 */
const REQUEST_TIMEOUT_MS = 15_000

/** Field names accepted for the checkout URL, in priority order. */
const URL_FIELDS = ['url', 'paymentUrl', 'payment_url', 'link', 'paymentLink'] as const

export class MakeProvider implements PaymentProvider {
  constructor(private config: MakeConfig) {}

  async createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
    payer?: PaymentPayer
  }): Promise<{ url: string; reference: string }> {
    const { chargeId, amount, description, orgId, payer } = params
    const reference = `mk_${randomUUID()}`

    let res: Response
    try {
      res = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference,
          chargeId,
          orgId,
          amount,
          description,
          payer: {
            fullName: payer?.fullName ?? null,
            phone: payer?.phone ?? null,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (err) {
      // A timeout and a DNS failure both land here. Name the URL: the org owner
      // reading this in the logs needs to know which scenario went quiet.
      throw new Error(
        `[make] Automation webhook did not respond (${this.config.webhookUrl}): ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[make] Automation webhook HTTP error ${res.status}: ${text.slice(0, 500)}`)
    }

    const raw = await res.text()
    const url = extractUrl(raw)

    if (!url) {
      throw new Error(
        `[make] Automation webhook returned no payment URL. ` +
          `Respond with JSON such as {"url":"https://…"} from a "Webhook response" ` +
          `(Make) or "Respond to Webhook" (n8n) module. Got: ${raw.slice(0, 500)}`
      )
    }

    return { url, reference }
  }
}

/**
 * Pulls the checkout URL out of whatever the scenario responded with.
 *
 * Accepts a JSON object under any of the common field names, a JSON object with
 * the payload nested one level under `data`/`body` (how a Make scenario that
 * forwards a module's output verbatim usually looks), or a bare URL as plain
 * text — a "Webhook response" module with its body set to a single mapped field
 * sends exactly that, and rejecting it would be a baffling failure.
 *
 * Exported for the registry's tests.
 */
export function extractUrl(rawBody: string): string | null {
  const trimmed = rawBody.trim()
  if (!trimmed) return null

  if (isHttpUrl(trimmed)) return trimmed

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }

  if (typeof parsed === 'string') {
    return isHttpUrl(parsed.trim()) ? parsed.trim() : null
  }

  if (!parsed || typeof parsed !== 'object') return null

  const candidates: Record<string, unknown>[] = [parsed as Record<string, unknown>]
  for (const nest of ['data', 'body'] as const) {
    const inner = (parsed as Record<string, unknown>)[nest]
    if (inner && typeof inner === 'object') {
      candidates.push(inner as Record<string, unknown>)
    }
  }

  for (const candidate of candidates) {
    for (const field of URL_FIELDS) {
      const value = candidate[field]
      if (typeof value === 'string' && isHttpUrl(value.trim())) {
        return value.trim()
      }
    }
  }

  return null
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Parses the optional fallback webhook at POST /api/payments/make.
 *
 * The supported settlement path is POST /api/v1/charges/{id}/payments with an
 * API key. This exists for an org that would rather fire a plain webhook, and
 * carries the same authenticity story as Grow: the reference is a secret only
 * Lessio and the org's own scenario have seen.
 */
export function parseMakeWebhookBody(
  body: Record<string, string>
): { reference: string; isSuccess: boolean } | null {
  const reference = body.reference || body.paymentReference || body.payment_reference
  if (!reference) return null

  const status = (body.status || body.result || '').toLowerCase()
  // An explicit status wins; a body carrying only a reference is read as a
  // success, because a scenario that fires this webhook at all has already
  // decided the payment went through.
  const isSuccess =
    status === ''
      ? true
      : ['paid', 'success', 'succeeded', 'completed', 'complete', 'true'].includes(status)

  return { reference, isSuccess }
}
