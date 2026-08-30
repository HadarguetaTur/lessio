/**
 * First-touch attribution capture.
 *
 * Per /docs/sprint-34-scope.md § מנוע המדידה, step 1.
 *
 * Shipped ahead of the rest of the measurement engine on purpose: attribution
 * that starts late leaves a hole nothing can backfill. Every day this is not
 * running is a day of signups whose origin is unknowable.
 *
 * Cookies only — no database write. This code runs in `proxy.ts`, on every
 * request, so it must cost nothing. The touch is persisted once, at signup,
 * onto the org that resulted from it.
 */

export const VISITOR_COOKIE = 'ls_vid'
export const FIRST_TOUCH_COOKIE = 'ls_attr'
export const LAST_TOUCH_COOKIE = 'ls_attr_last'

/** A year: long enough to cover a slow B2B decision, short enough to expire. */
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365
/** 90 days, matching the attribution window the ad platforms report on. */
export const TOUCH_MAX_AGE = 60 * 60 * 24 * 90

export type AttributionTouch = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  referrer?: string
  landingPath?: string
  gclid?: string
  fbclid?: string
  at: string
}

/** Values long enough to be an attack rather than a campaign name are cut. */
const MAX_VALUE_LENGTH = 200

function clean(value: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim().slice(0, MAX_VALUE_LENGTH)
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Reads a marketing touch out of a request, or null when there is nothing to
 * record.
 *
 * A visit with no utm parameters, no click id and no external referrer is
 * direct traffic — storing it would overwrite a real first touch with noise.
 */
export function readTouch(
  url: URL,
  referrer: string | null,
  selfHost: string
): AttributionTouch | null {
  const q = url.searchParams

  const source = clean(q.get('utm_source'))
  const medium = clean(q.get('utm_medium'))
  const campaign = clean(q.get('utm_campaign'))
  const content = clean(q.get('utm_content'))
  const term = clean(q.get('utm_term'))
  const gclid = clean(q.get('gclid'))
  const fbclid = clean(q.get('fbclid'))

  // Our own pages referring to each other are navigation, not acquisition.
  let externalReferrer: string | undefined
  const ref = clean(referrer)
  if (ref) {
    try {
      const host = new URL(ref).host
      if (host && host !== selfHost) externalReferrer = ref
    } catch {
      // Unparseable Referer header — ignore rather than store garbage.
    }
  }

  const hasSignal =
    source || medium || campaign || content || term || gclid || fbclid || externalReferrer
  if (!hasSignal) return null

  return {
    source,
    medium,
    campaign,
    content,
    term,
    gclid,
    fbclid,
    referrer: externalReferrer,
    landingPath: url.pathname,
    at: new Date().toISOString(),
  }
}

/** Cookie values are attacker-controllable; never trust the shape. */
export function decodeTouch(raw: string | undefined): AttributionTouch | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw))
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Record<string, unknown>
    if (typeof o.at !== 'string') return null

    const str = (v: unknown) =>
      typeof v === 'string' ? v.slice(0, MAX_VALUE_LENGTH) : undefined

    return {
      source: str(o.source),
      medium: str(o.medium),
      campaign: str(o.campaign),
      content: str(o.content),
      term: str(o.term),
      referrer: str(o.referrer),
      landingPath: str(o.landingPath),
      gclid: str(o.gclid),
      fbclid: str(o.fbclid),
      at: o.at,
    }
  } catch {
    return null
  }
}

export function encodeTouch(touch: AttributionTouch): string {
  return encodeURIComponent(JSON.stringify(touch))
}

/**
 * What gets frozen onto the organization at signup.
 *
 * Both touches are kept. In a channel with a long decision cycle the gap
 * between where someone first heard of you and what they clicked the day they
 * signed up is the entire question — collapsing them to one loses it.
 */
export function buildOrgAttribution(params: {
  firstTouch: AttributionTouch | null
  lastTouch: AttributionTouch | null
  visitorId: string | null
}): Record<string, unknown> | null {
  const { firstTouch, lastTouch, visitorId } = params
  if (!firstTouch && !lastTouch) return null

  return {
    first: firstTouch,
    last: lastTouch ?? firstTouch,
    visitorId,
    capturedAt: new Date().toISOString(),
  }
}
