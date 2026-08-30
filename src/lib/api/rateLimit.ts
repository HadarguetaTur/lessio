/**
 * Per-key rate limiting for /api/v1 — server-only.
 *
 * DB-backed, counting rows in api_request_log, following the pattern already
 * used for inbound WhatsApp (src/lib/whatsapp/idempotency.ts § isRateLimited).
 * An in-memory counter would be wrong here: on Vercel every lambda instance
 * holds its own map, so the effective limit is the configured one multiplied by
 * however many instances happen to be warm.
 *
 * Fails open on query errors, matching the WhatsApp limiter — a limiter that
 * takes the API down when the log table hiccups is worse than the burst it was
 * meant to smooth. Authentication (src/lib/api/auth.ts) fails closed; only the
 * throttle is permissive.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 120

export interface RateLimitResult {
  limited: boolean
  /** Requests already counted in the current window. */
  used: number
  limit: number
  /** Seconds until the window has certainly rolled over. */
  retryAfterSeconds: number
}

export async function checkRateLimit(keyId: string): Promise<RateLimitResult> {
  const db = createServiceRoleClient()
  const since = new Date(Date.now() - WINDOW_MS).toISOString()

  const { count, error } = await db
    .from('api_request_log')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', keyId)
    .gt('created_at', since)

  if (error) {
    console.warn('[api/rateLimit] check failed — failing open', {
      keyId,
      error: error.message,
    })
    return {
      limited: false,
      used: 0,
      limit: MAX_REQUESTS_PER_WINDOW,
      retryAfterSeconds: 0,
    }
  }

  const used = count ?? 0
  return {
    limited: used >= MAX_REQUESTS_PER_WINDOW,
    used,
    limit: MAX_REQUESTS_PER_WINDOW,
    retryAfterSeconds: Math.ceil(WINDOW_MS / 1000),
  }
}

/**
 * Records one request. Also the row the sliding window counts, so it must be
 * written for every authenticated request — including the ones that failed.
 * Never throws: losing a log row must not turn a successful call into a 500.
 */
export async function logApiRequest(params: {
  orgId: string
  keyId: string | null
  method: string
  path: string
  statusCode: number
}): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db.from('api_request_log').insert({
    organization_id: params.orgId,
    api_key_id: params.keyId,
    method: params.method,
    path: params.path,
    status_code: params.statusCode,
  })

  if (error) {
    console.error('[api/rateLimit] request log insert failed', {
      orgId: params.orgId,
      path: params.path,
      error: error.message,
    })
  }
}
