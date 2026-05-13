/**
 * GET /settings/email/callback
 *
 * OAuth2 callback from Google. Verifies the CSRF state cookie, exchanges the
 * code for tokens, encrypts the refresh token, and saves both the encrypted
 * token and the Gmail address on the org row.
 *
 * On success → redirect to /settings/email
 * On error   → redirect to /settings/email?error=<reason>
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { exchangeGmailCode } from '@/lib/gmail'
import { encryptGmailToken } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const STATE_COOKIE = 'gmail_oauth_state'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const settingsUrl = new URL('/settings/email', request.url)

  // User denied the consent screen
  if (errorParam) {
    settingsUrl.searchParams.set('error', 'denied')
    return clearStateAndRedirect(request, settingsUrl)
  }

  if (!code || !state) {
    settingsUrl.searchParams.set('error', 'invalid')
    return clearStateAndRedirect(request, settingsUrl)
  }

  // Verify CSRF state
  const storedState = request.cookies.get(STATE_COOKIE)?.value
  if (!storedState || storedState !== state) {
    settingsUrl.searchParams.set('error', 'state_mismatch')
    return clearStateAndRedirect(request, settingsUrl)
  }

  // Require authenticated org session
  let session: Awaited<ReturnType<typeof getSession>>
  try {
    session = await getSession()
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { orgId, role } = session
  if (role !== 'owner') {
    settingsUrl.searchParams.set('error', 'forbidden')
    return clearStateAndRedirect(request, settingsUrl)
  }

  // Exchange code → tokens
  let tokens: Awaited<ReturnType<typeof exchangeGmailCode>>
  try {
    tokens = await exchangeGmailCode(code)
  } catch (err) {
    console.error('[gmail/callback] Code exchange failed', { orgId, err })
    settingsUrl.searchParams.set('error', 'exchange')
    return clearStateAndRedirect(request, settingsUrl)
  }

  // Encrypt refresh token
  let encryptedRefreshToken: string
  try {
    encryptedRefreshToken = encryptGmailToken(tokens.refreshToken)
  } catch (err) {
    console.error('[gmail/callback] Encryption failed', { orgId, err })
    settingsUrl.searchParams.set('error', 'encrypt')
    return clearStateAndRedirect(request, settingsUrl)
  }

  // Persist to DB
  const db = createServiceRoleClient()
  const { error: dbError } = await db
    .from('organizations')
    .update({
      gmail_refresh_token: encryptedRefreshToken,
      gmail_connected_email: tokens.email,
    })
    .eq('id', orgId)

  if (dbError) {
    console.error('[gmail/callback] DB update failed', { orgId, error: dbError.message })
    settingsUrl.searchParams.set('error', 'db')
    return clearStateAndRedirect(request, settingsUrl)
  }

  console.info('[gmail/callback] Gmail connected', { orgId, email: tokens.email })
  settingsUrl.searchParams.set('connected', '1')
  return clearStateAndRedirect(request, settingsUrl)
}

function clearStateAndRedirect(request: NextRequest, target: URL): NextResponse {
  const response = NextResponse.redirect(target)
  response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' })
  return response
}
