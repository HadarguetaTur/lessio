/**
 * Optional HMAC verification for payment provider webhooks (server-only).
 * When the env secret is unset, verification is skipped (loud log) so dev
 * sandboxes keep working — configure secrets in production.
 */

import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Refuses to mint a payment link for a provider whose ONLY settlement path is a
 * signed webhook, when the signing secret is not configured.
 *
 * Bit and PayBox have no `confirmTransaction`, so the webhook handler's
 * `if (!requestVerified && !providerConfirmed) return { ok:false }` is the whole
 * story: with no secret in production, `verifyWebhookHmacSha256Base64` returns
 * false and EVERY payment is rejected. The parent pays, the money leaves their
 * account, and nothing settles — visible only as a line in the server log.
 *
 * Failing here instead turns that into "the owner cannot send the link and is
 * told why", which is a problem someone can act on.
 */
export function assertWebhookSettlementConfigured(
  secret: string | undefined,
  provider: string,
  envVarName: string
): void {
  if (secret) return
  if (process.env.NODE_ENV !== 'production') return
  throw new Error(
    `[payments/${provider}] ${envVarName} is not set. ${provider} settles only through a signed ` +
      'webhook, so without it every payment this link collects would be rejected by ' +
      '/api/payments/' + provider + ' and the charge would stay unpaid. Refusing to mint the link.'
  )
}

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
    if (process.env.NODE_ENV === 'production') {
      console.error(`${logPrefix} Webhook HMAC secret env not set in production`)
      return false
    }
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
