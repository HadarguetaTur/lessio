/**
 * Outbound reply poll — POST /api/internal/outbound/run-replies
 *
 * pg_cron (scripts/setup-crons.sql) calls this every 5 minutes, all day:
 * a reply may arrive at any hour and an interested lead should get the demo
 * email while it is still warm. Reads each active outreach mailbox's inbox
 * since its last poll and hands new messages to the engine.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronAuthorization } from '@/lib/cron/auth'
import { runReplyPoll } from '@/lib/outbound/transports/gmailReplies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  if (!hasValidCronAuthorization(request, { envHashVar: 'LESSIO_OUTBOUND_CRON_SECRET_SHA256' })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await runReplyPoll({ now: new Date() }))
  } catch (error) {
    console.error('[outbound/run-replies] failed', error)
    return NextResponse.json({ error: 'reply poll failed' }, { status: 500 })
  }
}
