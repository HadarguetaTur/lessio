/**
 * Payment provider server registry — server-only.
 *
 * Each entry in PROVIDER_REGISTRY defines the full behaviour of a payment provider:
 *   - validateConfig   — validates raw form field values and returns typed config
 *   - createAdapter    — instantiates the PaymentProvider from decrypted config
 *   - parseWebhookBody — extracts { reference, isSuccess } from a webhook POST body
 *
 * ─── How to add a new provider ────────────────────────────────────────────────
 * 1. Add the UI metadata entry to src/lib/payments/registry-ui.ts.
 * 2. Create the adapter class in src/lib/payments/<provider>.ts.
 * 3. Add one entry to PROVIDER_REGISTRY below (this file).
 *
 * No other files need to change — the form, actions, factory, and webhook
 * route all consume the registry automatically.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod'
import { CardcomProvider } from './cardcom'
import { PayPlusProvider } from './payplus'
import { BitProvider } from './bit'
import { PayBoxProvider } from './paybox'
import type { PaymentProvider } from './index'
import { verifyWebhookHmacSha256Base64 } from './webhook-verify'

// ── Registry entry interface ──────────────────────────────────────────────────

export interface RegistryEntry {
  /** Slug — must match the id in registry-ui.ts and the DB payment_provider value */
  id: string

  /**
   * Validates raw form fields extracted from FormData.
   * Returns the typed config object on success (ready to be JSON-serialised and encrypted),
   * or an error message on failure.
   */
  validateConfig(
    data: Record<string, string | undefined>
  ): { success: true; config: Record<string, string> } | { success: false; error: string }

  /**
   * Instantiates the payment provider adapter from a decrypted config object.
   * Called at payment-link creation time by the factory.
   */
  createAdapter(config: Record<string, string>): PaymentProvider

  /**
   * Parses the raw webhook POST body (JSON or form-encoded) sent by the provider.
   * Returns null if the body cannot be recognised as a payment notification.
   * Returns { reference, isSuccess } where reference = the payment_reference stored
   * in the charges table when the link was created.
   */
  parseWebhookBody(
    body: Record<string, string>
  ): { reference: string; isSuccess: boolean } | null

  /**
   * When present, must return true before the webhook mutates DB state.
   * If verification fails, the route still returns HTTP 200 but skips updates.
   */
  verifyWebhookRequest?(headers: Headers, rawBody: string): boolean
}

// ── Cardcom ───────────────────────────────────────────────────────────────────

const cardcomEntry: RegistryEntry = {
  id: 'cardcom',

  validateConfig(data) {
    const schema = z.object({
      terminal: z.string().min(1, 'מספר טרמינל נדרש'),
      apiName: z.string().min(1, 'API Name נדרש'),
      apiPassword: z.string().min(1, 'API Password נדרשת'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? 'נתונים לא תקינים' }
    }
    return { success: true, config: result.data }
  },

  createAdapter(config) {
    return new CardcomProvider({
      terminal: config.terminal!,
      apiName: config.apiName!,
      apiPassword: config.apiPassword!,
    })
  },

  parseWebhookBody(body) {
    // Cardcom sends: lowProfileCode (= reference), ResponseCode (0 = success)
    const reference = body.lowProfileCode ?? body.LowProfileCode
    const responseCode = body.ResponseCode ?? body.responseCode
    if (!reference) return null
    return { reference, isSuccess: responseCode === '0' }
  },
}

// ── PayPlus ───────────────────────────────────────────────────────────────────

const payPlusEntry: RegistryEntry = {
  id: 'payplus',

  validateConfig(data) {
    const schema = z.object({
      apiKey: z.string().min(1, 'API Key נדרש'),
      secretKey: z.string().min(1, 'Secret Key נדרש'),
      pageUid: z.string().min(1, 'Payment Page UID נדרש'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? 'נתונים לא תקינים' }
    }
    return { success: true, config: result.data }
  },

  createAdapter(config) {
    return new PayPlusProvider({
      apiKey: config.apiKey!,
      secretKey: config.secretKey!,
      pageUid: config.pageUid!,
    })
  },

  parseWebhookBody(body) {
    // PayPlus sends: page_request_uid (= reference), status ("success" | "failure")
    const reference = body.page_request_uid
    const status = body.status
    if (!reference) return null
    return { reference, isSuccess: status === 'success' }
  },
}

// ── Bit ───────────────────────────────────────────────────────────────────────

const bitEntry: RegistryEntry = {
  id: 'bit',

  validateConfig(data) {
    const schema = z.object({
      apiKey:     z.string().min(1, 'API Key נדרש'),
      secret:     z.string().min(1, 'Secret נדרש'),
      merchantId: z.string().min(1, 'Merchant ID נדרש'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? 'נתונים לא תקינים' }
    }
    return { success: true, config: result.data }
  },

  createAdapter(config) {
    return new BitProvider({
      apiKey:     config.apiKey!,
      secret:     config.secret!,
      merchantId: config.merchantId!,
    })
  },

  verifyWebhookRequest(headers, rawBody) {
    return verifyWebhookHmacSha256Base64(
      rawBody,
      headers,
      process.env.BIT_WEBHOOK_HMAC_SECRET,
      ['x-signature', 'X-Signature', 'x-bit-signature', 'X-Bit-Signature'],
      '[payments/bit]'
    )
  },

  parseWebhookBody(body) {
    const reference =
      body.transactionId ||
      body.TransactionId ||
      body.paymentId ||
      body.PaymentId ||
      body.externalId
    const status = (body.status || body.Status || '').toLowerCase()
    const event = (body.event || body.type || '').toLowerCase()
    if (!reference) return null
    const isSuccess =
      status === 'completed' ||
      status === 'success' ||
      status === 'paid' ||
      status === 'succeeded' ||
      /\b(complete|success|paid|succeeded)\b/.test(event)
    return { reference, isSuccess }
  },
}

// ── PayBox ────────────────────────────────────────────────────────────────────

const payboxEntry: RegistryEntry = {
  id: 'paybox',

  validateConfig(data) {
    const schema = z.object({
      apiKey:     z.string().min(1, 'API Key נדרש'),
      secret:     z.string().min(1, 'Secret נדרש'),
      merchantId: z.string().min(1, 'Merchant ID נדרש'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? 'נתונים לא תקינים' }
    }
    return { success: true, config: result.data }
  },

  createAdapter(config) {
    return new PayBoxProvider({
      apiKey:     config.apiKey!,
      secret:     config.secret!,
      merchantId: config.merchantId!,
    })
  },

  verifyWebhookRequest(headers, rawBody) {
    return verifyWebhookHmacSha256Base64(
      rawBody,
      headers,
      process.env.PAYBOX_WEBHOOK_HMAC_SECRET,
      ['x-signature', 'X-Signature', 'x-paybox-signature', 'X-PayBox-Signature'],
      '[payments/paybox]'
    )
  },

  parseWebhookBody(body) {
    const reference =
      body.transactionId ||
      body.TransactionId ||
      body.paymentId ||
      body.chargeId ||
      body.id
    const result = (body.result || body.status || body.Status || '').toLowerCase()
    if (!reference) return null
    const isSuccess =
      result === 'success' ||
      result === 'completed' ||
      result === 'paid' ||
      result === 'succeeded'
    return { reference, isSuccess }
  },
}

// ── Registry ──────────────────────────────────────────────────────────────────

const PROVIDER_REGISTRY: RegistryEntry[] = [cardcomEntry, payPlusEntry, bitEntry, payboxEntry]

/**
 * Returns the registry entry for a given provider ID.
 * Returns undefined if the provider is not registered.
 */
export function getRegistryEntry(id: string): RegistryEntry | undefined {
  return PROVIDER_REGISTRY.find(e => e.id === id)
}

/**
 * Returns all registered provider IDs.
 */
export function getRegisteredProviderIds(): string[] {
  return PROVIDER_REGISTRY.map(e => e.id)
}
