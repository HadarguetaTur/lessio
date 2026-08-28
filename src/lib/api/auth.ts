/**
 * Bearer-token authentication for /api/v1 — server-only.
 *
 * Deliberately NOT built on getSession() (src/lib/auth/session.ts): that helper
 * redirects to /login when there is no session, and a redirect is the wrong
 * answer for a machine — a Make scenario follows the 307, gets the login page's
 * HTML back with a 200, and reports success. Everything here throws or returns
 * null so the route can answer with a real status code.
 *
 * Downstream lib functions all take orgId as an explicit argument, so an
 * ApiSession reaches them unchanged.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { extractApiKey, hashApiKey, type ApiScope } from './keys'
import { ApiError } from './respond'

export interface ApiSession {
  orgId: string
  keyId: string
  scopes: ApiScope[]
}

/**
 * Resolves the API key on the request to a session, or null when the header is
 * missing, malformed, unknown, or revoked. Callers must not distinguish between
 * those cases in the response: a 401 that says which part was wrong is a
 * key-enumeration oracle.
 */
export async function resolveApiSession(req: Request): Promise<ApiSession | null> {
  const plaintext = extractApiKey(req.headers.get('authorization'))
  if (!plaintext) return null

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organization_api_keys')
    .select('id, organization_id, scopes, revoked_at')
    .eq('key_hash', hashApiKey(plaintext))
    .maybeSingle()

  if (error) {
    console.error('[api/auth] key lookup failed', { error: error.message })
    // Fail closed. Unlike the WhatsApp rate limiter — where failing open keeps a
    // paying org's parents talking — a lookup failure here would authenticate an
    // unknown caller against a whole org's data.
    throw new ApiError('internal_error', 'Could not verify credentials.')
  }

  if (!data || data.revoked_at) return null

  // Best-effort recency stamp for the settings screen. After the response so an
  // unrelated write never adds latency to, or fails, the caller's request.
  // Promise.resolve because a Supabase query builder is only PromiseLike, and
  // runAfterResponse hands its argument to Next's after(), which wants a Promise.
  await runAfterResponse(
    Promise.resolve(
      db
        .from('organization_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id)
    ).then(({ error: stampError }) => {
      if (stampError) {
        console.error('[api/auth] last_used_at stamp failed', {
          keyId: data.id,
          error: stampError.message,
        })
      }
    })
  )

  return {
    orgId: data.organization_id as string,
    keyId: data.id as string,
    scopes: (data.scopes ?? []) as ApiScope[],
  }
}

/** Throws a 403 unless the key carries the scope. */
export function requireScope(session: ApiSession, scope: ApiScope): void {
  if (!session.scopes.includes(scope)) {
    throw new ApiError(
      'forbidden',
      `This API key is missing the "${scope}" scope. Add it in Settings → Integrations.`
    )
  }
}
