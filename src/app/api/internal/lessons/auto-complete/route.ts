import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { completeDueLessons } from '@/lib/lessons/completeLesson'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hasValidCronAuthorization(request: NextRequest): boolean {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supplied || supplied.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}

export async function POST(request: NextRequest) {
  if (!hasValidCronAuthorization(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await completeDueLessons())
  } catch (error) {
    console.error('[automatic-lesson-completion] cron failed', error)
    return NextResponse.json({ error: 'automatic completion failed' }, { status: 500 })
  }
}
