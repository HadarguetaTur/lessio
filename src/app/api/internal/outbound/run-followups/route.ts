/**
 * Outbound follow-up run — POST /api/internal/outbound/run-followups
 *
 * pg_cron calls this a few times an hour inside the Israel working window.
 * Only prospects who already replied are ever due here, and each touch goes
 * out inside the conversation that already exists, from the mailbox that
 * started it.
 *
 * `?immediate=1` skips the window and the pauses; `?batch=N` caps the run.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronAuthorization } from '@/lib/cron/auth'
import { runFollowupBatch } from '@/lib/outbound/transports/gmailFollowups'

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
    return NextResponse.json(await runFollowupBatch({ now: new Date(), immediate, batch }))
  } catch (error) {
    console.error('[outbound/run-followups] failed', error)
    return NextResponse.json({ error: 'followup run failed' }, { status: 500 })
  }
}
