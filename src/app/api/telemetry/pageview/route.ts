/**
 * Landing pageview intake — the first-party measurement behind
 * /admin/attribution.
 *
 * Unauthenticated by nature (the visitor is anonymous), so, like the error
 * intake next door, everything is bounded — body size, field shapes, a per-
 * visitor rate limit — and it answers 204 whatever happened, giving a spammer
 * no signal to tune against. Already covered by the /api/telemetry/ bypass in
 * src/proxy.ts.
 *
 * What is stored is anonymous: the random visitor cookie, never the IP (used
 * only as an in-memory rate-limit key when that cookie is missing).
 */

import { NextRequest, NextResponse } from 'next/server'

import { LAST_TOUCH_COOKIE, VISITOR_COOKIE } from '@/lib/attribution'
import {
  MAX_BEACON_BYTES,
  beaconSchema,
  buildPageviewRow,
  isBotUserAgent,
} from '@/lib/landing-analytics/beacon'
import { NOTRACK_COOKIE } from '@/lib/landing-analytics/sections'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createSlidingWindow } from '@/lib/telemetry/slidingWindow'

export const runtime = 'nodejs'

const isVisitorLimited = createSlidingWindow({ max: 30, windowMs: 60_000 })

/**
 * A ceiling on writes per instance, whoever they come from. The production
 * database is small and has been knocked over by background load before; a
 * measurement feature must not be able to do that, even under a flood of
 * distinct visitor ids.
 */
const isInstanceSaturated = createSlidingWindow({ max: 300, windowMs: 60_000, maxKeys: 1 })

const NO_CONTENT = () => new NextResponse(null, { status: 204 })

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (request.cookies.get(NOTRACK_COOKIE)) return NO_CONTENT()

    // A signed-in browser is us or a customer, not a prospect reading the page.
    if (request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name))) return NO_CONTENT()

    const userAgent = request.headers.get('user-agent')
    if (isBotUserAgent(userAgent)) return NO_CONTENT()

    const fetchSite = request.headers.get('sec-fetch-site')
    if (fetchSite && fetchSite !== 'same-origin') return NO_CONTENT()

    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value?.slice(0, 64) ?? null
    const limiterKey =
      visitorId ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (isVisitorLimited(limiterKey)) return NO_CONTENT()
    if (isInstanceSaturated('all')) return NO_CONTENT()

    const raw = await request.text()
    if (raw.length > MAX_BEACON_BYTES) return NO_CONTENT()

    const parsed = beaconSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return NO_CONTENT()

    const row = buildPageviewRow({
      payload: parsed.data,
      visitorId,
      lastTouchCookie: request.cookies.get(LAST_TOUCH_COOKIE)?.value,
      userAgent,
      selfHost: request.nextUrl.host,
    })

    await createServiceRoleClient().rpc('record_landing_pageview', { p: row })
  } catch {
    // A lost beacon is not worth an error of its own.
  }

  return NO_CONTENT()
}
