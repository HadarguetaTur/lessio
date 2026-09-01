/**
 * Cookie consent — the gate in front of every pixel.
 *
 * Per /docs/sprint-34-scope.md § C. src/app/privacy/PrivacyHe.tsx already lists
 * Meta Pixel, GA4, PostHog and Hotjar as third parties and names the cookie
 * categories, while the codebase contained no tracking and no banner. Shipping
 * the pixels without this would turn a documentation gap into a real one.
 *
 * Isomorphic: the value is read on the server to decide which scripts to
 * render, and written on the client by the banner.
 */

export const CONSENT_COOKIE = 'ls_consent'
/** A year, matching the visitor cookie. Re-asking sooner is nagging. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365

/** What the visitor agreed to. `necessary` is not a choice and is never stored. */
export type ConsentDecision = {
  analytics: boolean
  marketing: boolean
  /** ISO timestamp of the decision — the evidence, not just the answer. */
  at: string
}

export function encodeConsent(decision: ConsentDecision): string {
  return `${decision.analytics ? 1 : 0}${decision.marketing ? 1 : 0}.${decision.at}`
}

/**
 * Cookie values are attacker-controllable and survive a format change, so an
 * unparseable value means "no decision yet" rather than an error or a default
 * of "yes".
 */
export function decodeConsent(raw: string | undefined): ConsentDecision | null {
  if (!raw) return null
  const match = /^([01])([01])\.(.+)$/.exec(raw)
  if (!match) return null
  return {
    analytics: match[1] === '1',
    marketing: match[2] === '1',
    at: match[3],
  }
}

/**
 * Whether a destination in this category may load.
 *
 * No decision means no: an unanswered banner is not consent, and loading a
 * marketing pixel before the visitor answers is exactly what the rules forbid.
 */
export function allowsCategory(
  decision: ConsentDecision | null,
  category: 'necessary' | 'analytics' | 'marketing'
): boolean {
  if (category === 'necessary') return true
  if (!decision) return false
  return category === 'analytics' ? decision.analytics : decision.marketing
}
