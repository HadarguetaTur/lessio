import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { setLocaleCookie } from '@/lib/i18n/localeCookie'
import type { AppLocale } from '@/lib/i18n/serverTranslator'

const PW_RESET_COOKIE = 'pw_reset'
const PW_RESET_MAX_AGE = 600 // 10 minutes

function safeNext(raw: string | null): string {
  const candidate = raw ?? '/dashboard'
  // Block open redirects: must be an internal path (starts with / but not //)
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/dashboard'
}

function setRecoveryCookie(response: NextResponse): void {
  response.cookies.set(PW_RESET_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: PW_RESET_MAX_AGE,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
}

async function getPreferredLocale(userId: string): Promise<AppLocale | null> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('profiles')
    .select('preferred_locale')
    .eq('id', userId)
    .maybeSingle()
  const value = data?.preferred_locale
  return value === 'he' || value === 'en' ? value : null
}

async function hasProfile(userId: string): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  return Boolean(data)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'recovery' | 'signup' | null
  const next = safeNext(searchParams.get('next'))

  const supabase = await createClient()

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Password-reset flow: set recovery cookie and redirect to /reset-password.
      if (next === '/reset-password') {
        const response = NextResponse.redirect(`${origin}${next}`)
        setRecoveryCookie(response)
        return response
      }

      // For Google OAuth new users: no profile exists yet → complete onboarding.
      if (data.user && !(await hasProfile(data.user.id))) {
        return NextResponse.redirect(`${origin}/signup/complete`)
      }

      // Unlike the password sign-in action, this route wrote no locale cookie,
      // so signing in with Google left the whole app falling back to
      // Accept-Language and ignoring the saved preference.
      const response = NextResponse.redirect(`${origin}${next}`)
      if (data.user) {
        const preferred = await getPreferredLocale(data.user.id)
        if (preferred) setLocaleCookie(response.cookies, preferred)
      }
      return response
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`)
      // Recovery OTP creates a full Supabase session immediately.
      // Set a short-lived cookie so the proxy can distinguish this from a
      // normal login session and enforce that the user completes the password
      // change before accessing the dashboard.
      if (type === 'recovery') setRecoveryCookie(response)
      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`)
}
