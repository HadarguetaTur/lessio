import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: vi.fn() }))

import { aggregatePageviews, sourceKeyOf, type PageviewRecord } from './report'
import { LANDING_SECTIONS } from './sections'

const bit = (section: (typeof LANDING_SECTIONS)[number]) => 1 << LANDING_SECTIONS.indexOf(section)

function view(overrides: Partial<PageviewRecord> = {}): PageviewRecord {
  return {
    visitor_id: 'v-1',
    path: '/tutors',
    link_slug: null,
    source: null,
    medium: null,
    campaign: null,
    content: null,
    referrer_host: null,
    sections_seen: bit('week'),
    max_scroll_pct: 0,
    engaged_ms: 0,
    cta_clicks: [],
    signup_org_id: null,
    lead_id: null,
    ...overrides,
  }
}

describe('sourceKeyOf', () => {
  it('groups by short link before UTM, then referrer, then direct', () => {
    expect(sourceKeyOf(view({ link_slug: 'morim-tlv', source: 'facebook' })).kind).toBe('link')
    expect(sourceKeyOf(view({ source: 'facebook', medium: 'group' }))).toMatchObject({
      kind: 'utm',
      name: 'facebook / group / — / —',
    })
    expect(sourceKeyOf(view({ referrer_host: 'm.facebook.com' })).kind).toBe('referrer')
    expect(sourceKeyOf(view()).kind).toBe('direct')
  })
})

describe('aggregatePageviews', () => {
  it('returns zeroes, not NaN, for no visits', () => {
    const { totals, sources } = aggregatePageviews([])
    expect(sources).toEqual([])
    expect(totals).toMatchObject({ visits: 0, uniqueVisitors: 0, medianEngagedMs: 0, signups: 0 })
  })

  it('counts section reach from the bitmask, independently per section', () => {
    const { totals } = aggregatePageviews([
      view({ sections_seen: bit('week') | bit('chain') | bit('pricing') }),
      // An anchor jump straight to pricing: nothing in between was seen.
      view({ sections_seen: bit('week') | bit('pricing') }),
      view({ sections_seen: bit('week') }),
    ])

    expect(totals.reached.week).toBe(3)
    expect(totals.reached.chain).toBe(1)
    expect(totals.reached.pricing).toBe(2)
    expect(totals.reached.final).toBe(0)
  })

  it('splits sources, sorts by visits, and counts unique visitors', () => {
    const { sources } = aggregatePageviews([
      view({ link_slug: 'a', visitor_id: 'v-1' }),
      view({ link_slug: 'a', visitor_id: 'v-1' }),
      view({ link_slug: 'a', visitor_id: 'v-2' }),
      view({ link_slug: 'b', visitor_id: 'v-3' }),
      // No cookie: cannot be deduplicated, so each is its own visitor.
      view({ link_slug: 'b', visitor_id: null }),
    ])

    expect(sources.map((s) => [s.name, s.visits, s.uniqueVisitors])).toEqual([
      ['a', 3, 2],
      ['b', 2, 2],
    ])
  })

  it('takes medians, so one tab left open overnight does not set the number', () => {
    const { totals } = aggregatePageviews([
      view({ engaged_ms: 5_000 }),
      view({ engaged_ms: 20_000 }),
      view({ engaged_ms: 3_600_000 }),
    ])
    expect(totals.medianEngagedMs).toBe(20_000)
  })

  it('counts CTA clicks per button and visits with any click once', () => {
    const { totals } = aggregatePageviews([
      view({ cta_clicks: ['hero-primary', 'pricing-solo'] }),
      view({ cta_clicks: ['hero-primary'] }),
      view(),
    ])

    expect(totals.visitsWithCta).toBe(2)
    expect(totals.ctaCounts).toEqual({ 'hero-primary': 2, 'pricing-solo': 1 })
    expect(totals.topCta).toBe('hero-primary')
  })

  it('counts a conversion once, however many rows carry it', () => {
    const { totals, sources } = aggregatePageviews([
      view({ link_slug: 'a', signup_org_id: 'org-1' }),
      view({ link_slug: 'a', signup_org_id: 'org-1' }),
      view({ link_slug: 'b', lead_id: 'lead-1' }),
    ])

    expect(totals.signups).toBe(1)
    expect(totals.leads).toBe(1)
    expect(sources.find((s) => s.name === 'a')?.signups).toBe(1)
    expect(sources.find((s) => s.name === 'b')?.leads).toBe(1)
  })
})
