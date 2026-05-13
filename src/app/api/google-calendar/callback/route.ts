/**
 * GET /api/google-calendar/callback
 *
 * Handles the OAuth2 callback from Google Calendar authorization.
 * Verifies CSRF state, exchanges code for tokens, encrypts refresh token,
 * and stores it in the DB (organizations or teacher_profiles depending on target).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { exchangeCalendarCode } from '@/lib/google-calendar'
import { encryptCalendarToken } from '@/lib/crypto'

const STATE_COOKIE = 'gcal_oauth_state'

function errorRedirect(request: NextRequest, target: string, code: string): NextResponse {
  const dest = target === 'teacher'
    ? `/teacher/calendar-connect?error=${code}`
    : `/settings/calendar?error=${code}`
  const response = NextResponse.redirect(new URL(dest, request.url))
  response.cookies.delete(STATE_COOKIE)
  return response
}

function successRedirect(request: NextRequest, target: string): NextResponse {
  const dest = target === 'teacher'
    ? '/teacher/calendar-connect?connected=1'
    : '/settings/calendar?connected=1'
  const response = NextResponse.redirect(new URL(dest, request.url))
  response.cookies.delete(STATE_COOKIE)
  return response
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const cookieValue = request.cookies.get(STATE_COOKIE)?.value ?? ''
  const colonIdx    = cookieValue.lastIndexOf(':')
  const cookieCsrf  = colonIdx > 0 ? cookieValue.slice(0, colonIdx) : ''
  const target      = colonIdx > 0 ? cookieValue.slice(colonIdx + 1) : 'org'

  if (error === 'access_denied') {
    return errorRedirect(request, target, 'denied')
  }

  if (!code || !state || !cookieCsrf) {
    return errorRedirect(request, target, 'invalid')
  }

  // State encodes csrf:target — the part before the last colon is the CSRF token
  const urlCsrf = state.includes(':') ? state.slice(0, state.lastIndexOf(':')) : state
  if (urlCsrf !== cookieCsrf) {
    return errorRedirect(request, target, 'state_mismatch')
  }

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
  if (!user) return errorRedirect(request, target, 'unauthenticated')

  let tokens: Awaited<ReturnType<typeof exchangeCalendarCode>>
  try {
    tokens = await exchangeCalendarCode(code)
  } catch (err) {
    console.error('[gcal/callback] Code exchange failed', { err })
    return errorRedirect(request, target, 'exchange')
  }

  let encryptedToken: string
  try {
    encryptedToken = encryptCalendarToken(tokens.refreshToken)
  } catch (err) {
    console.error('[gcal/callback] Encryption failed', { err })
    return errorRedirect(request, target, 'encrypt')
  }

  const db = createServiceRoleClient()

  if (target === 'teacher') {
    const { error: dbErr } = await db
      .from('teachers')
      .update({
        google_calendar_refresh_token: encryptedToken,
        google_calendar_email:         tokens.email,
      })
      .eq('profile_id', user.id)

    if (dbErr) {
      console.error('[gcal/callback] DB update (teacher) failed', { error: dbErr })
      return errorRedirect(request, target, 'db')
    }
  } else {
    // org — look up the org from profile
    const { data: profile } = await db
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.organization_id) {
      return errorRedirect(request, target, 'forbidden')
    }

    const { error: dbErr } = await db
      .from('organizations')
      .update({
        google_calendar_refresh_token: encryptedToken,
        google_calendar_email:         tokens.email,
      })
      .eq('id', profile.organization_id)

    if (dbErr) {
      console.error('[gcal/callback] DB update (org) failed', { error: dbErr })
      return errorRedirect(request, target, 'db')
    }
  }

  return successRedirect(request, target)
}
