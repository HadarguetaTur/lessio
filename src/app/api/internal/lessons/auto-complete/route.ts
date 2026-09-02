import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { completeDueLessons } from '@/lib/lessons/completeLesson'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hasValidCronAuthorization(request: NextRequest): boolean {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!supplied) return false

  // The plaintext token lives only in Supabase Vault. Keeping its SHA-256 here
  // avoids coupling the cron to whichever Supabase key Vercel currently uses.
  const expectedHash = process.env.LESSIO_AUTO_COMPLETION_CRON_SECRET_SHA256
    ?? '7f4a2b340daca568ec6f107f3e0501e2e0d04924df012f3701983283be96b109'
  const suppliedHash = createHash('sha256').update(supplied).digest()
  return timingSafeEqual(suppliedHash, Buffer.from(expectedHash, 'hex'))
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
