/**
 * Base-URL resolution for every absolute link the app builds.
 *
 * Two different questions, two different answers:
 *
 *   getShareableBaseUrl()  — for links that leave this machine: the parent
 *                            portal link an owner copies, an iCal feed a
 *                            teacher subscribes to, a payment provider's
 *                            success/cancel callback. These must NEVER be
 *                            `http://localhost:3000`, even when the code is
 *                            running on a dev box, because nobody on the
 *                            receiving end can reach it.
 *
 *   getRequestBaseUrl()    — (see ./requestUrl.ts) for links that come back to
 *                            whoever is browsing right now: password-reset and
 *                            signup-confirmation emails. Those SHOULD point at
 *                            localhost in dev, so the dev loop works.
 *
 * This module is isomorphic on purpose — `NEXT_PUBLIC_APP_URL` is inlined at
 * build time, so client components can call it too.
 */

/**
 * The canonical production origin. Used whenever the configured value is
 * missing or is a local address that would be useless to the recipient.
 * The apex (getlessio.com) 307-redirects to www, so www is the canonical form.
 */
export const PRODUCTION_APP_URL = 'https://www.getlessio.com'

/** Hosts that only resolve on the machine running the server. */
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|.*\.local)$/i

/** True for a URL that only the current machine can open. */
export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOST_PATTERN.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Drop a trailing slash so callers can append `/portal/...` safely. */
function normalize(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Base URL for a link that will be handed to someone else — a parent, a
 * teacher's calendar app, or a payment provider.
 *
 * Falls back to the production origin when `NEXT_PUBLIC_APP_URL` is unset or
 * points at localhost, so a dev build can never hand out an unreachable link.
 */
export function getShareableBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!configured || isLocalUrl(configured)) return PRODUCTION_APP_URL
  return normalize(configured)
}
