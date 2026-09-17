/**
 * Short marketing links: /go/<slug> → the landing page, with the link's UTM
 * values attached.
 *
 * A Facebook group post with a 200-character utm_* URL looks like an ad and
 * gets trimmed by hand; `getlessio.com/go/morim-tlv` does not. The slug's UTM
 * values live in marketing_links (managed at /admin/attribution).
 *
 * Deliberately unauthenticated and bypassed in src/proxy.ts. It sets no
 * cookies itself: the proxy skips attribution capture on /go/, and because a
 * browser keeps the original Referer across a redirect, the landing request
 * that follows carries the UTM values and the referring site together — so the
 * existing capture records one complete touch.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { isBotUserAgent } from '@/lib/landing-analytics/beacon'
import { SLUG_PATTERN } from '@/lib/landing-analytics/sections'
import {
  brokenLinkDestination,
  buildShortLinkDestination,
  type ShortLinkTarget,
} from '@/lib/landing-analytics/shortLink'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'

const COLUMNS = 'target_path, utm_source, utm_medium, utm_campaign, utm_content, utm_term'

function redirectTo(request: NextRequest, relative: string): NextResponse {
  // 302, never 301/308: a cached redirect would stop counting clicks and would
  // outlive any later edit to the link.
  const response = NextResponse.redirect(new URL(relative, request.nextUrl.origin), 302)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params
  const slug = rawSlug.toLowerCase()

  if (!SLUG_PATTERN.test(slug)) return redirectTo(request, brokenLinkDestination(slug))

  let link: ShortLinkTarget | null = null
  try {
    const db = createServiceRoleClient()
    // Facebook's crawler fetches every link the moment it is posted, and again
    // for each preview. Those are not clicks.
    if (isBotUserAgent(request.headers.get('user-agent'))) {
      const { data } = await db
        .from('marketing_links')
        .select(COLUMNS)
        .eq('slug', slug)
        .maybeSingle()
      link = (data as ShortLinkTarget | null) ?? null
    } else {
      const { data } = await db.rpc('bump_marketing_link', { p_slug: slug })
      link = ((data as ShortLinkTarget[] | null) ?? [])[0] ?? null
    }
  } catch {
    // The database being unreachable must not break a link someone posted.
  }

  if (!link) return redirectTo(request, brokenLinkDestination(slug))

  return redirectTo(request, buildShortLinkDestination(slug, link, request.nextUrl.searchParams))
}
