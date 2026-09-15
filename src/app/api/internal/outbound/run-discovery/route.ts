/** Daily public-business discovery. It can only create review candidates. */

import { NextRequest, NextResponse } from 'next/server'

import { hasValidCronAuthorization } from '@/lib/cron/auth'
import { runDiscovery } from '@/lib/outbound/discovery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!hasValidCronAuthorization(request, { envHashVar: 'LESSIO_OUTBOUND_CRON_SECRET_SHA256' })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await runDiscovery({ limit: 50 }))
  } catch (error) {
    console.error('[outbound/run-discovery] failed', error)
    return NextResponse.json({ error: 'discovery run failed' }, { status: 500 })
  }
}
