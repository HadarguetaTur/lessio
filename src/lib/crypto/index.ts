/**
 * AES-256-GCM encryption utilities — server-only.
 *
 * Two layers:
 *   1. Generic: encryptWithKey / decryptWithKey — accept a raw 64-char hex key.
 *      Used by any feature that manages its own encryption key.
 *   2. Convenience wrappers: encryptToken / decryptToken — use
 *      WHATSAPP_TOKEN_ENCRYPTION_KEY from the environment (Sprint 7, WhatsApp tokens).
 *
 * Encrypted format: base64(iv):base64(ciphertext):base64(authTag)
 * IV is 12 random bytes (96-bit) per AES-GCM recommendation.
 * Generate a key with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES   = 12
const TAG_BYTES  = 16

// ── Generic helpers (key supplied by caller) ──────────────────────────────────

/**
 * Encrypts a plaintext string with the provided 64-character hex key.
 * Returns a colon-delimited base64 string: iv:ciphertext:authTag
 */
export function encryptWithKey(plaintext: string, keyHex: string): string {
  if (keyHex.length !== 64) {
    throw new Error('[crypto] Encryption key must be a 64-character hex string (32 bytes)')
  }
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    encrypted.toString('base64'),
    tag.toString('base64'),
  ].join(':')
}

/**
 * Decrypts a value previously encrypted with encryptWithKey().
 * Throws if the ciphertext has been tampered with (GCM auth tag mismatch).
 */
export function decryptWithKey(encrypted: string, keyHex: string): string {
  if (keyHex.length !== 64) {
    throw new Error('[crypto] Encryption key must be a 64-character hex string (32 bytes)')
  }
  const key = Buffer.from(keyHex, 'hex')
  const parts = encrypted.split(':')

  if (parts.length !== 3) {
    throw new Error('[crypto] Invalid encrypted format — expected iv:ciphertext:authTag')
  }

  const [ivB64, ctB64, tagB64] = parts
  const iv         = Buffer.from(ivB64,  'base64')
  const ciphertext = Buffer.from(ctB64,  'base64')
  const tag        = Buffer.from(tagB64, 'base64')

  if (iv.length !== IV_BYTES) {
    throw new Error('[crypto] Invalid IV length in encrypted value')
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error('[crypto] Invalid auth tag length in encrypted value')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

// ── Google Calendar token convenience wrappers (Sprint 29) ───────────────────

function getCalendarKey(): string {
  const hex = process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY
  if (!hex) throw new Error('[crypto] GOOGLE_CALENDAR_ENCRYPTION_KEY is not set')
  if (hex.length !== 64) throw new Error('[crypto] GOOGLE_CALENDAR_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  return hex
}

export function encryptCalendarToken(plaintext: string): string {
  return encryptWithKey(plaintext, getCalendarKey())
}

export function decryptCalendarToken(encrypted: string): string {
  return decryptWithKey(encrypted, getCalendarKey())
}

// ── SaaS payment token wrappers (security audit 2026-09-04) ──────────────────

/**
 * Reuses PAYMENT_CONFIG_ENCRYPTION_KEY rather than introducing a key of its own.
 * The value protected here is the same class of secret the key already covers —
 * a payment credential — and it is required in production already, so no new
 * environment variable has to reach Vercel before this can ship.
 */
function getSaasPaymentKey(): string {
  const hex = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
  if (!hex) throw new Error('[crypto] PAYMENT_CONFIG_ENCRYPTION_KEY is not set')
  if (hex.length !== 64) throw new Error('[crypto] PAYMENT_CONFIG_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  return hex
}

/**
 * Encrypts the Sumit card token stored on organization_subscriptions.
 *
 * That row is SELECTable by an org's own owner and admin through the browser
 * publishable key, and Postgres has no column-level RLS — so the token, which
 * can be replayed to charge the stored card, cannot be left as plaintext there.
 */
export function encryptSaasPaymentToken(plaintext: string): string {
  return encryptWithKey(plaintext, getSaasPaymentKey())
}

/**
 * Decrypts a stored Sumit card token.
 *
 * Deliberately throws rather than returning null on failure. chargeSumitCustomer
 * treats a falsy token as "charge whatever card Sumit has on file", so a decrypt
 * regression that degraded to null would quietly bill the wrong card instead of
 * failing the attempt.
 */
export function decryptSaasPaymentToken(encrypted: string): string {
  return decryptWithKey(encrypted, getSaasPaymentKey())
}

// ── Gmail token convenience wrappers (Sprint 28) ─────────────────────────────

function getGmailKey(): string {
  const hex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error('[crypto] GMAIL_TOKEN_ENCRYPTION_KEY is not set')
  if (hex.length !== 64) throw new Error('[crypto] GMAIL_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  return hex
}

export function encryptGmailToken(plaintext: string): string {
  return encryptWithKey(plaintext, getGmailKey())
}

export function decryptGmailToken(encrypted: string): string {
  return decryptWithKey(encrypted, getGmailKey())
}

// ── WhatsApp token convenience wrappers (Sprint 7) ────────────────────────────

function getWhatsAppKey(): string {
  const hex = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY
  if (!hex) {
    throw new Error('[crypto] WHATSAPP_TOKEN_ENCRYPTION_KEY is not set')
  }
  if (hex.length !== 64) {
    throw new Error('[crypto] WHATSAPP_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return hex
}

/**
 * Encrypts a WhatsApp access token using WHATSAPP_TOKEN_ENCRYPTION_KEY.
 */
export function encryptToken(plaintext: string): string {
  return encryptWithKey(plaintext, getWhatsAppKey())
}

/**
 * Decrypts a WhatsApp access token previously encrypted with encryptToken().
 */
export function decryptToken(encrypted: string): string {
  return decryptWithKey(encrypted, getWhatsAppKey())
}
