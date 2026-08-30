/**
 * Client-side error intake — Sprint 32 M3.
 *
 * The React error boundaries run in the browser, so their failures never pass
 * through `onRequestError`. This is how they reach the same feed.
 *
 * Unauthenticated by necessity: the boundary that most needs to report is the
 * one that fired because the session or the shell itself broke. That makes the
 * route abusable, so everything here is bounded — body size, field lengths, and
 * a per-IP rate limit — and it returns 204 regardless, giving a spammer no
 * signal to tune against.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { reportError } from '@/lib/telemetry/reportError'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSupportSession } from '@/lib/support-session'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16_000

const bodySchema = z.object({
  name: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(200).optional(),
  route: z.string().max(500).optional(),
  url: z.string().max(1000).optional(),
})

/**
 * In-memory sliding window. Deliberately not the DB: this exists to stop a
 * loop hammering us, and a rate limiter that writes a row per rejected request
 * is not a rate limiter. Per-instance state is fine for that job.
 */
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000
const hits = new Map<string, number[]>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)

  // Bound the map so a rotating-IP flood cannot grow it without limit.
  if (hits.size > 5_000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(k)
    }
  }

  return recent.length > RATE_LIMIT_MAX
}

/**
 * Which org was looking at the broken page — best effort, never blocking.
 *
 * The route stays unauthenticated (see the contract above), but a report that
 * cannot name an org is a report nobody can act on: every client-side row
 * landed with `organization_id = null`, so the admin feed showed "0 orgs" for
 * real customer-facing failures, and the blast-radius rule in
 * src/lib/telemetry/threshold.ts — 3 events across 2 orgs — could never fire
 * for a browser error. An anonymous visitor still reports as null.
 */
async function resolveOrganizationId(): Promise<string | null> {
  try {
    // Support mode first, exactly like getSession(): a superadmin inspecting an
    // org is seeing that org's page, not their own (they have no org at all).
    const support = await getSupportSession()
    if (support) return support.targetOrgId

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await createServiceRoleClient()
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()

    return (data?.organization_id as string | null) ?? null
  } catch {
    // Same contract as the rest of this route: a failure to attribute must
    // never cost us the report itself.
    return null
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) return new NextResponse(null, { status: 204 })

  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 })

    const parsed = bodySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return new NextResponse(null, { status: 204 })

    await reportError({
      ...parsed.data,
      source: 'client',
      organizationId: await resolveOrganizationId(),
      userAgent: request.headers.get('user-agent'),
    })
  } catch {
    // A malformed report is not worth an error of its own.
  }

  return new NextResponse(null, { status: 204 })
}
