/**
 * Outbound send run — POST /api/internal/outbound/run-send
 *
 * pg_cron (scripts/setup-crons.sql) calls this every 10 minutes inside the
 * Israel working window. Each run claims a small batch and sends it from the
 * outreach mailbox with the most room today, pausing between messages. The
 * window is checked again here, so a schedule drift never sends at night.
 *
 * `?immediate=1` skips the window and the pauses; `?batch=N` caps the run.
 * Both still require the bearer token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronAuthorization } from '@/lib/cron/auth'
import { runSendBatch } from '@/lib/outbound/transports/gmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!hasValidCronAuthorization(request, { envHashVar: 'LESSIO_OUTBOUND_CRON_SECRET_SHA256' })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const immediate = url.searchParams.get('immediate') === '1'
  const batchRaw = Number(url.searchParams.get('batch'))
  const batch = Number.isInteger(batchRaw) && batchRaw > 0 ? Math.min(batchRaw, 20) : undefined

  try {
    return NextResponse.json(await runSendBatch({ now: new Date(), immediate, batch }))
  } catch (error) {
    console.error('[outbound/run-send] failed', error)
    return NextResponse.json({ error: 'send run failed' }, { status: 500 })
  }
}
