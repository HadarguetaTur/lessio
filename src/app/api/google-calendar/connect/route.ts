/**
 * GET /api/google-calendar/connect?target=org|teacher
 *
 * Initiates Google Calendar OAuth2 for the authenticated user.
 * Encodes the CSRF state and target in the state cookie.
 * Callback is handled by /api/google-calendar/callback.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { buildCalendarAuthUrl } from '@/lib/google-calendar'

const STATE_COOKIE  = 'gcal_oauth_state'
const STATE_TTL     = 600 // 10 minutes

export async function GET(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const rawTarget = request.nextUrl.searchParams.get('target')
  const target = rawTarget === 'teacher' ? 'teacher' : 'org'

  const csrf = randomBytes(16).toString('hex')

  let authUrl: string
  try {
    authUrl = buildCalendarAuthUrl(csrf, target)
  } catch (err) {
    console.error('[gcal/connect] Failed to build auth URL', { err })
    const dest = target === 'teacher' ? '/teacher/calendar-connect?error=config' : '/settings/calendar?error=config'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  const response = NextResponse.redirect(authUrl)
  // Store csrf:target in cookie so callback can verify and route correctly
  response.cookies.set(STATE_COOKIE, `${csrf}:${target}`, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   STATE_TTL,
    path:     '/',
  })

  return response
}
