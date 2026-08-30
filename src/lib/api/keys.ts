/**
 * API key minting and verification — server-only.
 *
 * Format: lsk_live_<43 base64url chars>  (32 random bytes)
 *
 * Storage is a sha256 digest, NOT encryptWithKey. The other secrets in this
 * codebase are third-party credentials we have to be able to replay (a Grow api
 * key, a Gmail refresh token), so they are encrypted and decryptable. An API key
 * is the opposite: we mint it, we only ever need to recognise it again, and 32
 * random bytes leave nothing to brute-force. A one-way digest means a database
 * leak hands out no working keys.
 *
 * The plaintext key exists for exactly one response — the create action returns
 * it, the UI shows it once, and it is unrecoverable after that.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto'

const KEY_PREFIX = 'lsk_live_'
const KEY_BYTES = 32
/** Characters kept on the row for identifying a key in the UI. */
const DISPLAY_PREFIX_LENGTH = 12

export type ApiScope = 'read' | 'write' | 'messages:send'

export const API_SCOPES: readonly ApiScope[] = ['read', 'write', 'messages:send'] as const

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value)
}

export interface MintedApiKey {
  /** Full plaintext key. Shown once, never stored. */
  plaintext: string
  /** sha256 hex digest — what goes in organization_api_keys.key_hash. */
  hash: string
  /** Leading characters kept for display. */
  prefix: string
}

/** Mints a new API key. The plaintext is the caller's only chance to see it. */
export function mintApiKey(): MintedApiKey {
  const plaintext = KEY_PREFIX + randomBytes(KEY_BYTES).toString('base64url')
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
  }
}

/** sha256 hex digest of a key. Deterministic — the lookup key for verification. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

/**
 * Extracts the key from an Authorization header.
 * Accepts `Bearer <key>` and a bare key, because Make's HTTP module makes it
 * easy to paste the key into a header value without the scheme and the
 * resulting 401 is otherwise impossible for an org owner to diagnose.
 * Returns null when the value is not shaped like one of our keys.
 */
export function extractApiKey(authorization: string | null): string | null {
  if (!authorization) return null

  const trimmed = authorization.trim()
  const candidate = /^bearer\s+/i.test(trimmed)
    ? trimmed.replace(/^bearer\s+/i, '').trim()
    : trimmed

  if (!candidate.startsWith(KEY_PREFIX)) return null
  if (candidate.length !== KEY_PREFIX.length + 43) return null

  return candidate
}

/**
 * Constant-time comparison of two hex digests.
 *
 * The digest lookup itself is indexed and not meaningfully timing-sensitive, but
 * anywhere a fetched hash is compared in application code this is the comparison
 * to use.
 */
export function digestsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
