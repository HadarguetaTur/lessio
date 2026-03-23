import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// All routes under (dashboard)/ that require Supabase session protection.
// Missing a prefix here does NOT break auth (layout.tsx also protects via getSession),
// but it means the middleware won't redirect unauthenticated users to /login
// before the page even renders — causing a slower round-trip and a missed
// chance to persist any freshly-rotated session cookies.
const DASHBOARD_PREFIXES = [
  '/dashboard',
  '/students',
  '/parents',
  '/teachers',
  '/lessons',
  '/charges',
  '/settings',
]

function isDashboardRoute(pathname: string): boolean {
  return DASHBOARD_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
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
  // See AGENTS.md § Authentication Model.
  if (request.nextUrl.pathname.startsWith('/book/')) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

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
          supabaseResponse = NextResponse.next({ request })
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

  const { pathname } = request.nextUrl

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

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
