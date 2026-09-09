import { NextRequest, NextResponse } from 'next/server'
import { refreshAllPhoneHealth } from '@/lib/whatsapp/health'
import { hasValidCronAuthorization } from '@/lib/cron/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Daily refresh of every connected number's quality rating, messaging tier and
 * verification status (src/lib/whatsapp/health.ts). The webhooks push changes
 * between runs; this is the catch-up for anything they missed.
 */
export async function POST(request: NextRequest) {
  if (
    !hasValidCronAuthorization(request, {
      envHashVar: 'LESSIO_WHATSAPP_CRON_SECRET_SHA256',
    })
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await refreshAllPhoneHealth())
  } catch (error) {
    console.error('[whatsapp-health] cron failed', error)
    return NextResponse.json({ error: 'health refresh failed' }, { status: 500 })
  }
}
