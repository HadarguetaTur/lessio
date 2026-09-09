/**
 * Opening-line drafting — POST /api/internal/outbound/run-openers
 *
 * pg_cron calls this every few minutes. It reads whatever source each pending
 * prospect points at and asks the platform model for one sentence. Nothing it
 * writes can be sent: a drafted opener waits for a person to approve it on
 * /admin/outbound, and the send claim skips anything not approved.
 *
 * `?limit=N` caps the run (the model call is the slow part).
 */

import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronAuthorization } from '@/lib/cron/auth'
import { runOpenerGeneration } from '@/lib/outbound/opener'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!hasValidCronAuthorization(request, { envHashVar: 'LESSIO_OUTBOUND_CRON_SECRET_SHA256' })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitRaw = Number(url.searchParams.get('limit'))
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : undefined

  try {
    return NextResponse.json(await runOpenerGeneration({ now: new Date(), limit }))
  } catch (error) {
    console.error('[outbound/run-openers] failed', error)
    return NextResponse.json({ error: 'opener run failed' }, { status: 500 })
  }
}
