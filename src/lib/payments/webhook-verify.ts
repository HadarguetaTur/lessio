/**
 * Optional HMAC verification for payment provider webhooks (server-only).
 * When the env secret is unset, verification is skipped (loud log) so dev
 * sandboxes keep working — configure secrets in production.
 */

import { createHmac, timingSafeEqual } from 'crypto'

function readSignatureHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const v = headers.get(name)
    if (v) return v.trim()
  }
  return null
}

/**
 * Verifies rawBody against a Base64-encoded SHA-256 HMAC using secret.
 * Tries several common header names (providers differ).
 */
export function verifyWebhookHmacSha256Base64(
  rawBody: string,
  headers: Headers,
  secret: string | undefined,
  headerNames: string[],
  logPrefix: string
): boolean {
  if (!secret) {
    console.warn(
      `${logPrefix} Webhook HMAC secret env not set — skipping verification (set for production)`
    )
    return true
  }

  const sig = readSignatureHeader(headers, headerNames)
  if (!sig) {
    console.error(`${logPrefix} Webhook missing signature header`, { tried: headerNames })
    return false
  }

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  try {
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
