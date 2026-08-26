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
      userAgent: request.headers.get('user-agent'),
    })
  } catch {
    // A malformed report is not worth an error of its own.
  }

  return new NextResponse(null, { status: 204 })
}
