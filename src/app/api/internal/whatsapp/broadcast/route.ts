import { NextRequest, NextResponse } from 'next/server'
import { runBroadcastTick } from '@/lib/whatsapp/broadcast/send'
import { hasValidCronAuthorization } from '@/lib/cron/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Drains broadcast campaigns: promotes anything scheduled that is now due,
 * claims a small batch of recipients and sends them with a pause between each.
 *
 * A campaign is not a request. Three hundred parents cannot be sent inside the
 * server action that started it — the function would time out mid-way and
 * nobody would know which parents got the message. So the action only queues,
 * and this runs every couple of minutes until the queue is empty.
 *
 * `?immediate=1` drops the pauses, for a manual run or a test. `?batch=N`
 * overrides the batch size, clamped by the sender.
 */
export async function POST(request: NextRequest) {
  if (
    !hasValidCronAuthorization(request, {
      envHashVar: 'LESSIO_WHATSAPP_CRON_SECRET_SHA256',
    })
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const immediate = url.searchParams.get('immediate') === '1'
  const batchParam = Number(url.searchParams.get('batch'))
  const batch = Number.isFinite(batchParam) && batchParam > 0 ? Math.min(batchParam, 50) : undefined

  try {
    return NextResponse.json(await runBroadcastTick({ immediate, batch }))
  } catch (error) {
    console.error('[whatsapp-broadcast] cron failed', error)
    return NextResponse.json({ error: 'broadcast run failed' }, { status: 500 })
  }
}
