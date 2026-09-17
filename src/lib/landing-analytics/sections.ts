/**
 * The vocabulary the landing tracker and its server share.
 *
 * Isomorphic: imported by the client tracker, the beacon route and the admin
 * report. The section order IS the storage format — `sections_seen` is a
 * bitmask whose bit index is the index in LANDING_SECTIONS — so append to this
 * list, never reorder it.
 */

/** Section element ids in src/components/marketing/LandingPage.tsx, top to bottom. */
export const LANDING_SECTIONS = [
  'week',
  'chain',
  'problem',
  'centre',
  'rollout',
  'trust',
  'audience',
  'pricing',
  'faq',
  'final',
] as const

export type LandingSection = (typeof LANDING_SECTIONS)[number]

export const SECTIONS_MASK_MAX = (1 << LANDING_SECTIONS.length) - 1

/** Pages the tracker is mounted on. Anything else is rejected by the beacon. */
export const LANDING_PATHS = ['/', '/tutors'] as const

export type LandingPath = (typeof LANDING_PATHS)[number]

/** Every `data-cta` value on the landing pages. An unknown one is dropped. */
export const KNOWN_CTAS = [
  'nav-signup',
  'nav-login',
  'hero-primary',
  'chain-primary',
  'chain-video',
  'pricing-solo',
  'pricing-studio',
  'pricing-center-enquiry',
  'center-enquiry-submit',
  'final-cta',
  'sticky-mobile',
] as const

export type KnownCta = (typeof KNOWN_CTAS)[number]

/** The query parameter /go/<slug> appends so a pageview names its short link. */
export const LINK_PARAM = 'ls_link'

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/

/** Set from /admin/attribution: this browser's visits are not recorded. */
export const NOTRACK_COOKIE = 'ls_notrack'

export function sectionReached(mask: number, section: LandingSection): boolean {
  return (mask & (1 << LANDING_SECTIONS.indexOf(section))) !== 0
}
