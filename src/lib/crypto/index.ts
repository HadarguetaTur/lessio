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
