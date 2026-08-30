/**
 * Route wrapper for /api/v1 — server-only.
 *
 * withApiAuth runs the same gauntlet for every endpoint, in this order:
 *   authenticate → rate limit → scope → plan feature → handler → log
 *
 * Rate limiting comes before the scope check so that a caller looping on a
 * mis-scoped key is still throttled; the scope check itself is free, so it
 * precedes the feature gate's query.
 *
 * ─── Rules for handlers ──────────────────────────────────────────────────────
 * Never call getSession() or requireFeature() from a route under /api/v1. Both
 * answer failure with redirect(), which reaches an automation as a 307 to the
 * login or billing page — followed, rendered, and reported as a success. Use the
 * ApiSession this wrapper provides and assertFeature().
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse, type NextRequest } from 'next/server'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { assertFeature, FeatureNotAvailableError } from '@/lib/saas/featureGate'
import { QuotaExceededError } from '@/lib/saas/quota'
import { ChargeAlreadyResolvedError } from '@/lib/charges'
import { resolveApiSession, requireScope, type ApiSession } from './auth'
import { checkRateLimit, logApiRequest } from './rateLimit'
import { ApiError, apiFailure } from './respond'
import type { ApiScope } from './keys'

export interface ApiContext<P> {
  req: NextRequest
  session: ApiSession
  params: P
}

type RouteContext<P> = { params: Promise<P> } | undefined

/**
 * Maps anything a handler can throw onto the response envelope.
 * Unknown errors become a bare 500 — the message may name a table, a column, or
 * a provider credential, and this response leaves the tenant boundary.
 */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err

  if (err instanceof FeatureNotAvailableError) {
    return new ApiError(
      'feature_unavailable',
      `Your plan does not include "${err.feature}". Upgrade in Settings → Billing.`
    )
  }

  if (err instanceof QuotaExceededError) {
    return new ApiError(
      'quota_exceeded',
      `Plan limit reached for ${err.kind} (${err.limit}). Upgrade in Settings → Billing.`
    )
  }

  if (err instanceof ChargeAlreadyResolvedError) {
    return new ApiError(
      'conflict',
      `This charge is ${err.status} and cannot be marked paid.`
    )
  }

  console.error('[api/v1] unhandled error', err)
  return new ApiError('internal_error', 'Something went wrong.')
}

export function withApiAuth<P extends Record<string, string> = Record<string, never>>(
  scope: ApiScope,
  handler: (ctx: ApiContext<P>) => Promise<NextResponse>
): (req: NextRequest, ctx?: RouteContext<P>) => Promise<NextResponse> {
  return async function route(req: NextRequest, ctx?: RouteContext<P>): Promise<NextResponse> {
    // A static route (/api/v1/me) is called with no second argument at all.
    const params = ctx?.params ? await ctx.params : ({} as P)

    let session: ApiSession | null = null

    try {
      session = await resolveApiSession(req)

      if (!session) {
        // Deliberately uniform: missing, malformed, unknown and revoked keys all
        // land here with the same body, so the response cannot be used to probe
        // which keys exist.
        throw new ApiError(
          'unauthorized',
          'Missing or invalid API key. Send it as: Authorization: Bearer lsk_live_…'
        )
      }

      const rate = await checkRateLimit(session.keyId)
      if (rate.limited) {
        throw new ApiError(
          'rate_limited',
          `Rate limit exceeded (${rate.limit} requests per minute).`,
          { 'Retry-After': String(rate.retryAfterSeconds) }
        )
      }

      requireScope(session, scope)
      await assertFeature(session.orgId, 'integrations')

      const response = await handler({ req, session, params })
      recordRequest(req, session, response.status)
      return response
    } catch (err) {
      const apiError = toApiError(err)
      if (session) recordRequest(req, session, apiError.status)
      return apiFailure(apiError)
    }
  }
}

/**
 * Writes the request log after the response. Every authenticated request is
 * logged, failures included — the rate-limit window counts these rows, so
 * skipping the failures would let a caller retry past the limit for free.
 */
function recordRequest(req: NextRequest, session: ApiSession, statusCode: number): void {
  void runAfterResponse(
    logApiRequest({
      orgId: session.orgId,
      keyId: session.keyId,
      method: req.method,
      path: new URL(req.url).pathname,
      statusCode,
    })
  )
}
