import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import {
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  TOUCH_MAX_AGE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
  encodeTouch,
  readTouch,
} from '@/lib/attribution'

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

/**
 * Stamps the visitor id and marketing touch cookies onto a response.
 *
 * Per /docs/sprint-34-scope.md § מנוע המדידה, step 1. Cookies only — this runs
 * on every request, so it must not touch the database. The touch is persisted
 * once, at signup, onto the organization it produced.
 *
 * Only top-level document navigations are considered: an asset or a fetch
 * carries the page's own query string and would otherwise re-record the same
 * touch several times per pageview.
 */
function captureAttribution(request: NextRequest, response: NextResponse): void {
  if (request.method !== 'GET') return
  if (request.nextUrl.pathname.startsWith('/api/')) return
  if (request.headers.get('sec-fetch-dest') === 'empty') return
  if (!request.headers.get('accept')?.includes('text/html')) return

  const secure = request.nextUrl.protocol === 'https:'
  const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' }

  if (!request.cookies.get(VISITOR_COOKIE)) {
    response.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
      ...base,
      maxAge: VISITOR_MAX_AGE,
    })
  }

  const touch = readTouch(
    request.nextUrl,
    request.headers.get('referer'),
    request.nextUrl.host
  )
  if (!touch) return

  const encoded = encodeTouch(touch)

  // First touch is written once and never again. Overwriting it would mean the
  // last ad someone clicked erases the channel that actually found them.
  if (!request.cookies.get(FIRST_TOUCH_COOKIE)) {
    response.cookies.set(FIRST_TOUCH_COOKIE, encoded, { ...base, maxAge: TOUCH_MAX_AGE })
  }
  response.cookies.set(LAST_TOUCH_COOKIE, encoded, { ...base, maxAge: TOUCH_MAX_AGE })
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
  //
  // /portal/* is served directly. Do NOT reintroduce the Sprint 23 301 to
  // /he/portal/* that used to live here: middleware runs on every method, so it
  // answered Server Action POSTs with a 301 too. Browsers downgrade a redirected
  // POST to GET and drop the body and the Next-Action header, which killed OTP
  // verification and made portal login impossible. Legacy /he/portal/* links are
  // still honoured by the rewrite in next.config.ts — a rewrite is invisible to
  // the client and never changes the method, which is why it is safe here.
  const { pathname } = request.nextUrl

  if (
    request.nextUrl.pathname.startsWith('/book/') ||
    request.nextUrl.pathname.startsWith('/portal/') ||
    request.nextUrl.pathname.startsWith('/he/portal/') ||
    request.nextUrl.pathname.startsWith('/api/calendar/') ||
    // Sumit SaaS billing webhook — authenticated via HMAC, no Supabase session
    request.nextUrl.pathname.startsWith('/api/sumit/') ||
    // Meta WhatsApp webhook — verify token (GET) / X-Hub-Signature-256 (POST).
    // Must not depend on Supabase Auth: a failing auth.getUser() here would turn
    // into a 500 towards Meta, and repeated failures disable the subscription.
    request.nextUrl.pathname.startsWith('/api/whatsapp/') ||
    // Payment provider webhooks — each provider is authenticated by the registry
    // entry (HMAC, or a reference only the provider could mint). No Supabase
    // session exists on these calls, so the auth round-trip is pure latency.
    request.nextUrl.pathname.startsWith('/api/payments/') ||
    // Sprint 33: the public API for Make / n8n / MCP. Authenticated per request
    // by an org API key (src/lib/api/auth.ts) — there is never a Supabase cookie
    // on these calls, so the auth round-trip is pure latency. Leaving it out
    // would not expose anything (the routes authenticate themselves), it would
    // just make every automation call slower.
    request.nextUrl.pathname.startsWith('/api/v1/') ||
    // /pay/<chargeId> — the redirect a WhatsApp template's pay button points at.
    // Anyone holding the link is the parent who was sent it; it only ever
    // forwards to the provider's own checkout, which does its own auth.
    request.nextUrl.pathname.startsWith('/pay/') ||
    // Client error reports. Unauthenticated on purpose: the boundary that most
    // needs to report is the one that fired because the session or the shell
    // itself broke, and an auth round-trip here would silently drop exactly
    // those reports. The route is bounded and rate-limited instead.
    request.nextUrl.pathname.startsWith('/api/telemetry/') ||
    // Supabase pg_cron calls these with a bearer token whose SHA-256 the app
    // holds (src/lib/cron/auth.ts). They run in Next.js because this runtime
    // owns the billing and payment-provider adapters.
    request.nextUrl.pathname.startsWith('/api/internal/lessons/auto-complete') ||
    request.nextUrl.pathname.startsWith('/api/internal/saas/')
  ) {
    // Bypassed routes are still real landing surfaces for a campaign, so they
    // get the attribution cookie too — just not the Supabase session round-trip.
    const bypassResponse = NextResponse.next()
    captureAttribution(request, bypassResponse)
    return bypassResponse
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

  captureAttribution(request, supabaseResponse)

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
