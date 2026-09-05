import { NextRequest, NextResponse } from 'next/server'
import { completeDueLessons } from '@/lib/lessons/completeLesson'
import { hasValidCronAuthorization } from '@/lib/cron/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (
    !hasValidCronAuthorization(request, {
      envHashVar: 'LESSIO_AUTO_COMPLETION_CRON_SECRET_SHA256',
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
