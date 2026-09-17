/**
 * Where a /go/<slug> short link sends its visitor.
 *
 * Pure so the redirect's one dangerous property — it is unauthenticated and
 * forwards wherever a database column points — is testable without a request.
 */

import { LINK_PARAM } from './sections'

export type ShortLinkTarget = {
  target_path: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
}

/** Relative, single leading slash, no backslash tricks: never another origin. */
export function isSafeTargetPath(path: string): boolean {
  return /^\/(?![/\\])/.test(path) && !/[\\\r\n]/.test(path)
}

/** Click ids the ad platforms append; forwarded so attribution sees them. */
const PASSTHROUGH = ['fbclid', 'gclid'] as const

/**
 * Builds the path + query to redirect to. Returns a relative URL; the caller
 * resolves it against its own origin.
 */
export function buildShortLinkDestination(
  slug: string,
  link: ShortLinkTarget,
  incoming: URLSearchParams
): string {
  const base = isSafeTargetPath(link.target_path) ? link.target_path : '/'
  const url = new URL(base, 'https://self.invalid')

  const utm: Record<string, string | null> = {
    utm_source: link.utm_source,
    utm_medium: link.utm_medium,
    utm_campaign: link.utm_campaign,
    utm_content: link.utm_content,
    utm_term: link.utm_term,
  }
  for (const [key, value] of Object.entries(utm)) {
    if (value) url.searchParams.set(key, value)
  }
  url.searchParams.set(LINK_PARAM, slug)

  for (const key of PASSTHROUGH) {
    const value = incoming.get(key)
    if (value) url.searchParams.set(key, value.slice(0, 200))
  }

  return url.pathname + url.search + url.hash
}

/**
 * A link that was posted somewhere must never dead-end, even when it is
 * mistyped or its row is gone — and tagging the fallback makes the broken link show
 * up in the report instead of vanishing into "direct".
 */
export function brokenLinkDestination(slug: string): string {
  const params = new URLSearchParams({
    utm_source: 'go',
    utm_medium: 'broken-link',
    utm_content: slug.slice(0, 40),
  })
  return `/?${params.toString()}`
}
