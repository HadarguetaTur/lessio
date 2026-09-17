/**
 * The pure half of the landing beacon: validate what the browser sent and turn
 * it into the row `record_landing_pageview` stores.
 *
 * Everything here is attacker-reachable — the route is unauthenticated — so the
 * payload is bounded field by field and the stored row is built from an
 * allowlist rather than spread from the input.
 */

import { z } from 'zod'

import { decodeTouch, readTouch, type AttributionTouch } from '@/lib/attribution'
import {
  KNOWN_CTAS,
  LANDING_PATHS,
  LINK_PARAM,
  SECTIONS_MASK_MAX,
  SLUG_PATTERN,
} from './sections'

export const MAX_BEACON_BYTES = 4_000

export const beaconSchema = z
  .object({
    id: z.uuid(),
    path: z.enum(LANDING_PATHS),
    search: z.string().max(1000).default(''),
    referrer: z.string().max(500).optional(),
    sections: z.number().int().min(0).max(SECTIONS_MASK_MAX),
    scrollPct: z.number().int().min(0).max(100),
    engagedMs: z.number().int().min(0).max(3_600_000),
    ctas: z.array(z.string().max(40)).max(12),
    firstCtaMs: z.number().int().min(0).max(3_600_000).optional(),
    locale: z.enum(['he', 'en']),
  })
  .strict()

export type BeaconPayload = z.infer<typeof beaconSchema>

/**
 * A last-touch cookie older than this belongs to an earlier visit. Within it,
 * a pageview with no source of its own is the same visit moving between pages
 * (/ → /tutors), so it inherits the source it arrived with.
 */
const SAME_VISIT_MS = 30 * 60 * 1000

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|telegram|preview|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|axios|node-fetch/i

/** Link previewers and crawlers: they load the page, they are not a visit. */
export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return true
  return BOT_UA.test(userAgent)
}

export function classifyDevice(userAgent: string | null): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent ?? ''
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobile'
  return 'desktop'
}

/** Which app's embedded browser, when there is one — they behave unlike Safari/Chrome. */
export function classifyInApp(userAgent: string | null): 'fb' | 'ig' | 'other' | null {
  const ua = userAgent ?? ''
  if (/instagram/i.test(ua)) return 'ig'
  if (/fban|fbav|fb_iab/i.test(ua)) return 'fb'
  if (/\bwv\b|line\/|micromessenger|tiktok/i.test(ua)) return 'other'
  return null
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host.slice(0, 200) || null
  } catch {
    return null
  }
}

export type PageviewRow = {
  id: string
  visitor_id: string | null
  path: string
  link_slug: string | null
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  referrer_host: string | null
  has_fbclid: boolean
  has_gclid: boolean
  touch_from_cookie: boolean
  device: 'mobile' | 'tablet' | 'desktop'
  in_app: string | null
  locale: string
  sections_seen: number
  max_scroll_pct: number
  engaged_ms: number
  cta_clicks: string[]
  first_cta: string | null
  first_cta_ms: number | null
}

/**
 * Builds the stored row.
 *
 * The source is per *visit*, which is why this reads the pageview's own URL
 * first and the first-touch cookie never: the question this table answers is
 * "what did the post I put up yesterday bring", not "where did this person
 * first hear of us" — organizations.attribution already keeps that.
 */
export function buildPageviewRow(input: {
  payload: BeaconPayload
  visitorId: string | null
  lastTouchCookie: string | undefined
  userAgent: string | null
  selfHost: string
  now?: number
}): PageviewRow {
  const { payload, visitorId, lastTouchCookie, userAgent, selfHost } = input
  const now = input.now ?? Date.now()

  let url: URL
  try {
    url = new URL(payload.path + payload.search, `https://${selfHost}`)
  } catch {
    url = new URL(payload.path, `https://${selfHost}`)
  }

  let touch: AttributionTouch | null = readTouch(url, payload.referrer ?? null, selfHost)
  let fromCookie = false
  if (!touch) {
    const cookieTouch = decodeTouch(lastTouchCookie)
    const age = cookieTouch ? now - Date.parse(cookieTouch.at) : NaN
    if (cookieTouch && age >= 0 && age <= SAME_VISIT_MS) {
      touch = cookieTouch
      fromCookie = true
    }
  }

  const slug = url.searchParams.get(LINK_PARAM)
  const known = new Set<string>(KNOWN_CTAS)
  const ctas = payload.ctas.filter((c) => known.has(c))

  return {
    id: payload.id,
    visitor_id: visitorId,
    path: payload.path,
    link_slug: slug && SLUG_PATTERN.test(slug) ? slug : null,
    source: touch?.source ?? null,
    medium: touch?.medium ?? null,
    campaign: touch?.campaign ?? null,
    content: touch?.content ?? null,
    term: touch?.term ?? null,
    referrer_host: hostOf(touch?.referrer),
    has_fbclid: Boolean(touch?.fbclid),
    has_gclid: Boolean(touch?.gclid),
    touch_from_cookie: fromCookie,
    device: classifyDevice(userAgent),
    in_app: classifyInApp(userAgent),
    locale: payload.locale,
    sections_seen: payload.sections,
    max_scroll_pct: payload.scrollPct,
    engaged_ms: payload.engagedMs,
    cta_clicks: ctas,
    first_cta: ctas[0] ?? null,
    first_cta_ms: ctas.length > 0 ? (payload.firstCtaMs ?? null) : null,
  }
}
