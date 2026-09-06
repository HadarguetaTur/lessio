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
import { StripeProvider } from './stripe'
import {
  GrowProvider,
  parseGrowWebhookBody,
  parseGrowInvoiceWebhookBody,
  growWebhookTransactionIds,
} from './grow'
import { MakeProvider, parseMakeWebhookBody } from './make'
import { ManualLinkProvider } from './manual-link'
import type { PaymentProvider } from './index'
import { verifyWebhookHmacSha256Base64 } from './webhook-verify'

// ── Registry entry interface ──────────────────────────────────────────────────

export interface RegistryEntry {
  /** Slug — must match the id in registry-ui.ts and the DB payment_provider value */
  id: string
  /** True only for a generic callback with cryptographic authentication. */
  acceptsWebhookSettlement?: boolean

  /**
   * Validates raw form fields extracted from FormData.
   * Returns the typed config object on success (ready to be JSON-serialised and encrypted),
   * or a catalog key on failure — this is sync, so it cannot await a translator.
   */
  validateConfig(
    data: Record<string, string | undefined>
  ): { success: true; config: Record<string, string> } | { success: false; errorKey?: string }

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
  ): {
    reference: string
    isSuccess: boolean
    amount?: number
    merchantReference?: string
  } | null

  /**
   * When present, must return true before the webhook mutates DB state.
   * If verification fails, the route still returns HTTP 200 but skips updates.
   */
  verifyWebhookRequest?(headers: Headers, rawBody: string): boolean

  /**
   * Every identifier the provider gave for the transaction, taken from the
   * payment webhook body and stored on the charge. Only needed by providers
   * that later send asynchronous events keyed on something other than the
   * payment reference — Grow's invoice webhook is the case this exists for.
   */
  webhookTransactionIds?(body: Record<string, string>): string[]

  /**
   * Parses a provider's separate invoice-issued webhook. Present only for
   * providers that issue the tax document themselves and announce it.
   * `transactionCode` is matched against the ids stored by webhookTransactionIds.
   */
  parseInvoiceWebhookBody?(
    body: Record<string, string>
  ): { transactionCode: string; invoiceUrl: string; invoiceNumber: string | null } | null
}

// ── Cardcom ───────────────────────────────────────────────────────────────────

const cardcomEntry: RegistryEntry = {
  id: 'cardcom',
  acceptsWebhookSettlement: true,

  validateConfig(data) {
    const schema = z.object({
      terminal: z.string().min(1, 'validation.terminalRequired'),
      apiName: z.string().min(1, 'validation.apiNameRequired'),
      apiPassword: z.string().min(1, 'validation.apiPasswordRequired'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, errorKey: result.error.issues[0]?.message }
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
    // V11 sends LowProfileId; keep the V10 name for existing terminals.
    const reference = body.LowProfileId ?? body.lowProfileId ?? body.lowProfileCode ?? body.LowProfileCode
    const responseCode = body.ResponseCode ?? body.responseCode
    if (!reference) return null
    return { reference, isSuccess: responseCode === '0' }
  },
}

// ── PayPlus ───────────────────────────────────────────────────────────────────

const payPlusEntry: RegistryEntry = {
  id: 'payplus',
  acceptsWebhookSettlement: true,

  validateConfig(data) {
    const schema = z.object({
      apiKey: z.string().min(1, 'validation.apiKeyRequired'),
      secretKey: z.string().min(1, 'validation.secretKeyRequired'),
      pageUid: z.string().min(1, 'validation.paymentPageUidRequired'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, errorKey: result.error.issues[0]?.message }
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
    // The callback contract calls this payment_request_uid; older GenerateLink
    // examples used page_request_uid, so accept both during the transition.
    const reference = body.payment_request_uid ?? body.page_request_uid
    const status = (body.status ?? '').toLowerCase()
    const transactionType = (body.transaction_type ?? body.type ?? '').toLowerCase()
    const chargeMethod = body.charge_method
    if (!reference) return null
    const explicitlyFailed = ['failure', 'failed', 'declined', 'cancelled', 'canceled'].includes(status)
    const isRefund = transactionType.includes('refund') || chargeMethod === '4'
    // By default PayPlus sends this callback only for successful transactions.
    // Its authenticated hash is what makes that provider statement trustworthy.
    const amount = Number(body.amount)
    const merchantReference = body.more_info
    if (!Number.isFinite(amount) || amount <= 0 || !merchantReference) return null
    return { reference, isSuccess: !explicitlyFailed && !isRefund, amount, merchantReference }
  },
}

// ── Bit ───────────────────────────────────────────────────────────────────────

const bitEntry: RegistryEntry = {
  id: 'bit',
  acceptsWebhookSettlement: true,

  validateConfig(data) {
    const schema = z.object({
      apiKey:     z.string().min(1, 'validation.apiKeyRequired'),
      secret:     z.string().min(1, 'validation.secretRequired'),
      merchantId: z.string().min(1, 'validation.merchantIdRequired'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, errorKey: result.error.issues[0]?.message }
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
  acceptsWebhookSettlement: true,

  validateConfig(data) {
    const schema = z.object({
      apiKey:     z.string().min(1, 'validation.apiKeyRequired'),
      secret:     z.string().min(1, 'validation.secretRequired'),
      merchantId: z.string().min(1, 'validation.merchantIdRequired'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, errorKey: result.error.issues[0]?.message }
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

// ── Stripe ────────────────────────────────────────────────────────────────────

const stripeEntry: RegistryEntry = {
  id: 'stripe',
  acceptsWebhookSettlement: true,

  validateConfig(data) {
    const schema = z.object({
      secretKey:     z.string().min(1, 'validation.secretKeyRequired'),
      webhookSecret: z.string().min(1, 'validation.webhookSecretRequired'),
      currency:      z.string().min(3).max(3, 'Currency code must be 3 letters (e.g. ILS, USD)'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, errorKey: result.error.issues[0]?.message }
    }
    return { success: true, config: result.data }
  },

  createAdapter(config) {
    return new StripeProvider({
      secretKey:     config.secretKey!,
      webhookSecret: config.webhookSecret!,
      currency:      config.currency!,
    })
  },

  parseWebhookBody(body) {
    // Stripe sends JSON events. We look for checkout.session.completed.
    // The reference is the Checkout Session ID stored in charges.payment_reference.
    const type = body.type
    if (type !== 'checkout.session.completed') return null

    const sessionId = body['data.object.id'] || body.session_id

    // webhookBodyFromPayload preserves the nested path as dotted keys.
    const reference = sessionId
    if (!reference) return null

    const paymentStatus = (
      body['data.object.payment_status'] ?? body.payment_status ?? ''
    ).toLowerCase()
    const isSuccess = paymentStatus === 'paid' || paymentStatus === 'complete'

    if (!isSuccess) return null

    const amountMinor = Number(body['data.object.amount_total'])
    const merchantReference =
      body['data.object.client_reference_id'] ?? body['data.object.metadata.charge_id']
    if (!Number.isFinite(amountMinor) || amountMinor <= 0 || !merchantReference) return null
    return { reference, isSuccess: true, amount: amountMinor / 100, merchantReference }
  },
}

// ── Grow (formerly Meshulam) ──────────────────────────────────────────────────

const growEntry: RegistryEntry = {
  id: 'grow',

  validateConfig(data) {
    const schema = z.object({
      userId:   z.string().min(1, 'validation.userIdRequired'),
      pageCode: z.string().min(1, 'validation.pageCodeRequired'),
      apiKey:   z.string().min(1, 'validation.apiKeyRequired'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, errorKey: result.error.issues[0]?.message }
    }
    return { success: true, config: result.data }
  },

  createAdapter(config) {
    return new GrowProvider({
      userId:   config.userId!,
      pageCode: config.pageCode!,
      apiKey:   config.apiKey!,
    })
  },

  // No verifyWebhookRequest: Grow signs nothing. The reference itself is the
  // shared secret — processToken is minted by Grow and known only to us — and
  // the adapter's acknowledgeWebhook closes the loop with approveTransaction.
  parseWebhookBody: parseGrowWebhookBody,
  webhookTransactionIds: growWebhookTransactionIds,
  parseInvoiceWebhookBody: parseGrowInvoiceWebhookBody,
}

// ── Make / n8n automation webhook ─────────────────────────────────────────────

const makeEntry: RegistryEntry = {
  id: 'make',

  validateConfig(data) {
    const schema = z.object({
      webhookUrl: z.url('validation.webhookUrlInvalid'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, errorKey: result.error.issues[0]?.message }
    }
    return { success: true, config: result.data }
  },

  createAdapter(config) {
    return new MakeProvider({ webhookUrl: config.webhookUrl! })
  },

  // No verifyWebhookRequest, for the same reason Grow has none: this hook is
  // synchronous and so cannot decrypt the org's config to reach a per-org
  // secret. The supported settlement path avoids the problem entirely — the
  // scenario calls POST /api/v1/charges/{id}/payments with an API key. This
  // parser only serves orgs that prefer a plain webhook, where the minted
  // reference is the shared secret.
  parseWebhookBody: parseMakeWebhookBody,
}

// ── Fixed payment link ────────────────────────────────────────────────────────

const manualLinkEntry: RegistryEntry = {
  id: 'manual_link',

  validateConfig(data) {
    const schema = z.object({
      paymentUrl: z.url('validation.paymentUrlInvalid'),
    })
    const result = schema.safeParse(data)
    if (!result.success) {
      return { success: false, errorKey: result.error.issues[0]?.message }
    }
    return { success: true, config: result.data }
  },

  createAdapter(config) {
    return new ManualLinkProvider({ paymentUrl: config.paymentUrl! })
  },

  // A static link has no remote side that could ever call back, so no webhook
  // body is recognisable. Charges close through the manual paths (mark as
  // paid / record a payment) or POST /api/v1/charges/{id}/payments.
  parseWebhookBody() {
    return null
  },
}

// ── Registry ──────────────────────────────────────────────────────────────────

const PROVIDER_REGISTRY: RegistryEntry[] = [cardcomEntry, payPlusEntry, bitEntry, payboxEntry, stripeEntry, growEntry, makeEntry, manualLinkEntry]

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
