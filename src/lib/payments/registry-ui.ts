/**
 * Payment provider UI metadata — client-safe.
 *
 * This file defines the display information and form fields for each supported
 * payment provider. It contains NO server-only code (no crypto, no Node.js, no DB).
 *
 * Importing this file is safe for both server components and 'use client' components.
 *
 * ─── How to add a new provider ────────────────────────────────────────────────
 * 1. Add an entry here (label, description, fields).
 * 2. Add the adapter + webhook parser to src/lib/payments/registry.ts.
 * 3. That's it — form, actions, and webhook route update automatically.
 * ──────────────────────────────────────────────────────────────────────────────
 */

export interface ProviderFieldDef {
  /** HTML input name — must match the field key in the adapter config */
  name: string
  label: string
  type: 'text' | 'password'
  placeholder?: string
  /** Short helper text shown below the input */
  hint?: string
}

export interface ProviderUIDef {
  /** Slug — matches the value stored in organizations.payment_provider */
  id: string
  label: string
  /** Short description shown in the provider selector */
  description?: string
  /** Link to the provider's developer portal (optional) */
  docsUrl?: string
  /** Help text shown above the credential fields */
  setupHint?: string
  fields: ProviderFieldDef[]
}

export const PROVIDERS_UI: ProviderUIDef[] = [
  {
    id: 'cardcom',
    label: 'Cardcom',
    description: 'ספק תשלום ישראלי — כרטיסי אשראי, ביט, PayPal',
    docsUrl: 'https://developers.cardcom.solutions/',
    setupHint: 'הפרטים נמצאים ב-Cardcom במערכת הניהול תחת הגדרות API.',
    fields: [
      {
        name: 'terminal',
        label: 'מספר טרמינל',
        type: 'text',
        placeholder: 'לדוגמה: 1000',
      },
      {
        name: 'apiName',
        label: 'API Name',
        type: 'text',
      },
      {
        name: 'apiPassword',
        label: 'API Password',
        type: 'password',
      },
    ],
  },
  {
    id: 'payplus',
    label: 'PayPlus (פייפלוס)',
    description: 'ספק תשלום ישראלי — כרטיסי אשראי, ביט, Apple Pay, Google Pay',
    docsUrl: 'https://docs.payplus.co.il/',
    setupHint: 'הפרטים נמצאים ב-app.payplus.co.il תחת הגדרות → מפתחות API. Payment Page UID נמצא בהגדרות דף התשלום.',
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'text',
      },
      {
        name: 'secretKey',
        label: 'Secret Key',
        type: 'password',
      },
      {
        name: 'pageUid',
        label: 'Payment Page UID',
        type: 'text',
        placeholder: 'לדוגמה: 7a0bc4d4-f35f-4301-a945-926378a2416d',
        hint: 'UID ייחודי של דף התשלום שהגדרת ב-PayPlus',
      },
    ],
  },
  {
    id: 'bit',
    label: 'Bit Business (ביט)',
    description: 'תשלומים דרך אפליקציית ביט — פופולרי בישראל',
    docsUrl: 'https://developer.bitpay.co.il',
    setupHint: 'הפרטים נמצאים בפורטל המפתחים של ביט Business. יש לפתוח חשבון ביט Business תחילה.',
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'text',
      },
      {
        name: 'secret',
        label: 'Secret',
        type: 'password',
      },
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        placeholder: 'מזהה בית העסק',
      },
    ],
  },
  {
    id: 'paybox',
    label: 'PayBox (פייבוקס)',
    description: 'תשלומים דרך אפליקציית PayBox — פופולרי בישראל',
    docsUrl: 'https://developer.payboxapp.com',
    setupHint: 'הפרטים נמצאים בפורטל המפתחים של PayBox.',
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'text',
      },
      {
        name: 'secret',
        label: 'Secret',
        type: 'password',
      },
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        placeholder: 'מזהה בית העסק',
      },
    ],
  },
]

/**
 * Returns the UI definition for a given provider ID, or undefined if not found.
 */
export function getProviderUI(id: string): ProviderUIDef | undefined {
  return PROVIDERS_UI.find(p => p.id === id)
}
