import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronAuthorization } from '@/lib/cron/auth'
import { runCandidateResearch } from '@/lib/outbound/discovery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!hasValidCronAuthorization(request, { envHashVar: 'LESSIO_OUTBOUND_CRON_SECRET_SHA256' })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await runCandidateResearch())
  } catch {
    console.error('[outbound/run-research] research run failed')
    return NextResponse.json({ error: 'research run failed' }, { status: 500 })
  }
}
