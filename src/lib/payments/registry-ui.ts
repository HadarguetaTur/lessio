/**
 * Payment provider UI metadata — client-safe.
 *
 * This file defines the structure of each supported payment provider. It
 * contains NO server-only code (no crypto, no Node.js, no DB) and NO display
 * copy: labels, descriptions, setup hints, placeholders and field hints all
 * live in `settings.paymentProviders.<id>` in the message catalogs, because the
 * settings screen renders in the viewer's language.
 *
 * Importing this file is safe for both server components and 'use client' components.
 *
 * ─── How to add a new provider ────────────────────────────────────────────────
 * 1. Add an entry here (id + field names/types).
 * 2. Add `settings.paymentProviders.<id>` to messages/he.json and messages/en.json.
 * 3. Add the adapter + webhook parser to src/lib/payments/registry.ts.
 * 4. That's it — form, actions, and webhook route update automatically.
 * ──────────────────────────────────────────────────────────────────────────────
 */

export interface ProviderFieldDef {
  /** HTML input name — must match the field key in the adapter config */
  name: string
  type: 'text' | 'password'
  /** True when the catalog carries a `placeholder` for this field */
  hasPlaceholder?: boolean
  /** True when the catalog carries a `hint` for this field */
  hasHint?: boolean
}

export interface ProviderUIDef {
  /** Slug — matches the value stored in organizations.payment_provider, and the catalog key */
  id: string
  /** Link to the provider's developer portal (optional) */
  docsUrl?: string
  fields: ProviderFieldDef[]
}

export const PROVIDERS_UI: ProviderUIDef[] = [
  {
    id: 'cardcom',
    docsUrl: 'https://developers.cardcom.solutions/',
    fields: [
      { name: 'terminal', type: 'text', hasPlaceholder: true },
      { name: 'apiName', type: 'text' },
      { name: 'apiPassword', type: 'password' },
    ],
  },
  {
    id: 'payplus',
    docsUrl: 'https://docs.payplus.co.il/',
    fields: [
      { name: 'apiKey', type: 'text' },
      { name: 'secretKey', type: 'password' },
      { name: 'pageUid', type: 'text', hasPlaceholder: true, hasHint: true },
    ],
  },
  {
    id: 'bit',
    docsUrl: 'https://developer.bitpay.co.il',
    fields: [
      { name: 'apiKey', type: 'text' },
      { name: 'secret', type: 'password' },
      { name: 'merchantId', type: 'text', hasPlaceholder: true },
    ],
  },
  {
    id: 'paybox',
    docsUrl: 'https://developer.payboxapp.com',
    fields: [
      { name: 'apiKey', type: 'text' },
      { name: 'secret', type: 'password' },
      { name: 'merchantId', type: 'text', hasPlaceholder: true },
    ],
  },
  {
    id: 'stripe',
    docsUrl: 'https://dashboard.stripe.com/apikeys',
    fields: [
      { name: 'secretKey', type: 'password', hasPlaceholder: true, hasHint: true },
      { name: 'webhookSecret', type: 'password', hasPlaceholder: true, hasHint: true },
      { name: 'currency', type: 'text', hasPlaceholder: true, hasHint: true },
    ],
  },
  {
    id: 'grow',
    docsUrl: 'https://developers.grow.business/',
    fields: [
      { name: 'userId', type: 'text', hasPlaceholder: true, hasHint: true },
      { name: 'pageCode', type: 'text', hasPlaceholder: true, hasHint: true },
      { name: 'apiKey', type: 'password', hasHint: true },
    ],
  },
  // Appended, not inserted: PROVIDERS_UI[0] is the form's default selection, so
  // the order here is user-visible.
  //
  // One field on purpose. PaymentProviderForm marks every field `required`, so a
  // provider that needs an optional field would force a change there; keeping
  // this to a single mandatory URL keeps the "registry + catalog only" promise
  // intact. The callback is authenticated by the org's API key, not by a secret
  // stored here.
  {
    id: 'make',
    docsUrl: 'https://www.make.com/en/help/tools/webhooks',
    fields: [{ name: 'webhookUrl', type: 'text', hasPlaceholder: true, hasHint: true }],
  },
]

/**
 * Returns the UI definition for a given provider ID, or undefined if not found.
 */
export function getProviderUI(id: string): ProviderUIDef | undefined {
  return PROVIDERS_UI.find(p => p.id === id)
}
