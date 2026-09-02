import { NextRequest, NextResponse } from 'next/server'
import { completeDueLessons } from '@/lib/lessons/completeLesson'
import { hasValidCronAuthorization } from '@/lib/cron/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (
    !hasValidCronAuthorization(request, {
      envHashVar: 'LESSIO_AUTO_COMPLETION_CRON_SECRET_SHA256',
      // The token already deployed for this job, kept so the cron keeps working
      // if the env var is absent.
      fallbackHash: '7f4a2b340daca568ec6f107f3e0501e2e0d04924df012f3701983283be96b109',
    })
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await completeDueLessons())
  } catch (error) {
    console.error('[automatic-lesson-completion] cron failed', error)
    return NextResponse.json({ error: 'automatic completion failed' }, { status: 500 })
  }
}
