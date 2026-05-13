import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// All routes under (dashboard)/ that require Supabase session protection.
// Missing a prefix here does NOT break auth (layout.tsx also protects via getSession),
// but it means the proxy won't redirect unauthenticated users to /login
// before the page even renders — causing a slower round-trip and a missed
// chance to persist any freshly-rotated session cookies.
const DASHBOARD_PREFIXES = [
  '/dashboard',
  '/students',
  '/parents',
  '/teachers',
  '/lessons',
  '/charges',
  '/billing',
  '/subscriptions',
  '/account',
  '/settings',
  '/teacher',
  '/homework',
  '/reports',
  '/onboarding',
  // Sprint 18: superadmin platform shell
  '/admin',
]

function isDashboardRoute(pathname: string): boolean {
  return DASHBOARD_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

export const PATHNAME_HEADER = 'x-pathname'

export function buildForwardedHeaders(request: NextRequest): Headers {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname)
  return requestHeaders
}

/**
 * Builds a redirect response that carries over any Set-Cookie headers that
 * supabaseResponse accumulated during the getUser() call.
 *
 * WHY: With enable_refresh_token_rotation = true (see supabase/config.toml),
 * a successful token refresh inside getUser() issues a NEW refresh token and
 * invalidates the old one after refresh_token_reuse_interval (10 s).
 * If we return a plain NextResponse.redirect() here, the browser never
 * receives the updated Set-Cookie headers, so it keeps sending the old
 * (now-consumed) refresh token on subsequent requests. After 10 seconds the
 * reuse window closes and all refreshes fail → redirect to /login → loop.
 */
function redirectWithSession(url: URL, supabaseResponse: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url)
  for (const cookie of supabaseResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
  }
  return redirectResponse
}

export async function proxy(request: NextRequest) {
  // /book/* uses signed JWT auth only — no Supabase session middleware.
  // /portal/* uses httpOnly cookie session — no Supabase session middleware.
  // /api/calendar/* is public — UUID token is the auth mechanism (Sprint 16).
  // See AGENTS.md § Authentication Model.
  // Story 2b (Sprint 23): Backward-compat redirect for legacy portal URLs shared with parents.
  // /portal/:orgId → /he/portal/:orgId (permanent 301 so old links still work).
  // Note: /he/portal/* paths are NOT caught here — they start with /he/ which this block
  // does not match, so they fall through to NextResponse.next() below.
  const { pathname } = request.nextUrl
  if (/^\/portal\/[^/]/.test(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = `/he${pathname}`
    return NextResponse.redirect(url, { status: 301 })
  }

  if (
    request.nextUrl.pathname.startsWith('/book/') ||
    request.nextUrl.pathname.startsWith('/portal/') ||
    request.nextUrl.pathname.startsWith('/he/portal/') ||
    request.nextUrl.pathname.startsWith('/api/calendar/') ||
    // Sumit SaaS billing webhook — authenticated via HMAC, no Supabase session
    request.nextUrl.pathname.startsWith('/api/sumit/')
  ) {
    return NextResponse.next()
  }

  // Forward pathname as x-pathname so server components (e.g. dashboard layout)
  // can read the current path for role-based redirects without needing the router.
  const requestHeaders = buildForwardedHeaders(request)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Preserve requestHeaders (including x-pathname) when rebuilding the response
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — required for Server Components to read auth state.
  // This call may rotate the refresh token and populate supabaseResponse
  // with new Set-Cookie headers via the setAll handler above.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Recovery-flow isolation: the pw_reset cookie is set by /auth/callback
  // immediately after verifyOtp('recovery') or exchangeCodeForSession when
  // next=/reset-password.  While it is present:
  //  • /reset-password is the ONLY page a user (authenticated or not) may visit.
  //  • Any other route — including /login and /dashboard — bounces back to
  //    /reset-password so the session cannot be silently hijacked by navigation.
  const hasPwReset = request.cookies.get('pw_reset')?.value === '1'

  if (pathname === '/reset-password') {
    if (!hasPwReset) {
      // No valid recovery flow in progress — block access.
      const url = request.nextUrl.clone()
      url.pathname = user ? '/dashboard' : '/login'
      return redirectWithSession(url, supabaseResponse)
    }
    // Cookie present → allow through to the reset form.
    return supabaseResponse
  }

  if (hasPwReset) {
    // User holds a recovery session but navigated away from /reset-password
    // (e.g. clicked "back to login"). Lock them back to the reset form so
    // the recovery session cannot be used to access the dashboard directly.
    const url = request.nextUrl.clone()
    url.pathname = '/reset-password'
    return redirectWithSession(url, supabaseResponse)
  }

  // Unauthenticated user accessing a dashboard route → redirect to /login.
  // Use redirectWithSession so any rotated token cookies are preserved.
  if (!user && isDashboardRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return redirectWithSession(url, supabaseResponse)
  }

  // Authenticated user at /login → redirect to /dashboard.
  // Use redirectWithSession so any rotated token cookies are preserved.
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return redirectWithSession(url, supabaseResponse)
  }

  // Authenticated user at marketing entry points → dashboard.
  if (user && (pathname === '/' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return redirectWithSession(url, supabaseResponse)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
