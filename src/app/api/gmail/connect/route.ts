/**
 * GET /api/gmail/connect
 *
 * Initiates the Gmail OAuth2 flow for the authenticated org owner.
 * Generates a random CSRF state token, stores it in a short-lived httpOnly
 * cookie, then redirects the browser to Google's authorization page.
 *
 * The callback at /settings/email/callback verifies the state cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { buildGmailAuthUrl } from '@/lib/gmail'

const STATE_COOKIE = 'gmail_oauth_state'
const STATE_TTL_SECONDS = 600 // 10 minutes

export async function GET(request: NextRequest) {
  // Verify Supabase session — only authenticated org owners may initiate
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

  const state = randomBytes(16).toString('hex')

  let authUrl: string
  try {
    authUrl = buildGmailAuthUrl(state)
  } catch (err) {
    console.error('[gmail/connect] Failed to build auth URL', { err })
    return NextResponse.redirect(
      new URL('/settings/email?error=config', request.url)
    )
  }

  const response = NextResponse.redirect(authUrl)
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS,
    path: '/',
  })

  return response
}
