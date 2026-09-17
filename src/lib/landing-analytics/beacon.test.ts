import { describe, expect, it } from 'vitest'

import { encodeTouch } from '@/lib/attribution'
import {
  beaconSchema,
  buildPageviewRow,
  classifyDevice,
  classifyInApp,
  isBotUserAgent,
  type BeaconPayload,
} from './beacon'

const ID = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'
const IPHONE_FB =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]'
const NOW = Date.parse('2026-09-18T10:00:00Z')

function payload(overrides: Partial<BeaconPayload> = {}): BeaconPayload {
  return {
    id: ID,
    path: '/tutors',
    search: '',
    sections: 0b11,
    scrollPct: 40,
    engagedMs: 12_000,
    ctas: [],
    locale: 'he',
    ...overrides,
  }
}

function build(overrides: Partial<BeaconPayload> = {}, lastTouchCookie?: string) {
  return buildPageviewRow({
    payload: payload(overrides),
    visitorId: 'v-1',
    lastTouchCookie,
    userAgent: IPHONE_FB,
    selfHost: 'www.getlessio.com',
    now: NOW,
  })
}

describe('beaconSchema', () => {
  it('accepts a well-formed payload', () => {
    expect(beaconSchema.safeParse(payload()).success).toBe(true)
  })

  it('rejects a path the tracker is not mounted on', () => {
    expect(beaconSchema.safeParse({ ...payload(), path: '/dashboard' }).success).toBe(false)
  })

  it('rejects unknown fields, out-of-range numbers and oversize strings', () => {
    expect(beaconSchema.safeParse({ ...payload(), ip: '1.2.3.4' }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...payload(), sections: 1 << 10 }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...payload(), scrollPct: 101 }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...payload(), search: 'x'.repeat(1001) }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...payload(), id: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('buildPageviewRow', () => {
  it('takes the source from the pageview URL, and names the short link', () => {
    const row = build({
      search: '?utm_source=facebook&utm_medium=group&utm_campaign=close-september&utm_content=morim-tlv&ls_link=morim-tlv&fbclid=abc',
      referrer: 'https://m.facebook.com/groups/12345/posts/678',
    })

    expect(row).toMatchObject({
      source: 'facebook',
      medium: 'group',
      campaign: 'close-september',
      content: 'morim-tlv',
      link_slug: 'morim-tlv',
      has_fbclid: true,
      has_gclid: false,
      touch_from_cookie: false,
      device: 'mobile',
      in_app: 'fb',
    })
  })

  it('stores the referrer host only — never the path that names the group', () => {
    const row = build({ referrer: 'https://m.facebook.com/groups/12345/posts/678' })
    expect(row.referrer_host).toBe('m.facebook.com')
    expect(JSON.stringify(row)).not.toContain('12345')
  })

  it('never stores the click id itself', () => {
    const row = build({ search: '?fbclid=SECRETCLICKID' })
    expect(JSON.stringify(row)).not.toContain('SECRETCLICKID')
  })

  it('prefers the URL over the last-touch cookie', () => {
    const cookie = encodeTouch({ source: 'google', at: new Date(NOW - 60_000).toISOString() })
    expect(build({ search: '?utm_source=facebook' }, cookie).source).toBe('facebook')
  })

  it('inherits the last touch for an internal navigation within the same visit', () => {
    const cookie = encodeTouch({
      source: 'facebook',
      medium: 'group',
      at: new Date(NOW - 5 * 60_000).toISOString(),
    })
    expect(build({}, cookie)).toMatchObject({ source: 'facebook', touch_from_cookie: true })
  })

  it('treats an old last touch as a different visit: this one is direct', () => {
    const cookie = encodeTouch({ source: 'facebook', at: new Date(NOW - 31 * 60_000).toISOString() })
    expect(build({}, cookie)).toMatchObject({ source: null, touch_from_cookie: false })
  })

  it('ignores our own pages as a referrer', () => {
    expect(build({ referrer: 'https://www.getlessio.com/' }).referrer_host).toBeNull()
  })

  it('drops an invalid short-link slug and unknown CTAs', () => {
    const row = build({
      search: '?ls_link=../../etc',
      ctas: ['hero-primary', '<script>', 'pricing-solo'],
      firstCtaMs: 4200,
    })
    expect(row.link_slug).toBeNull()
    expect(row.cta_clicks).toEqual(['hero-primary', 'pricing-solo'])
    expect(row.first_cta).toBe('hero-primary')
    expect(row.first_cta_ms).toBe(4200)
  })

  it('has no first-CTA timing when no known CTA was clicked', () => {
    expect(build({ ctas: ['nope'], firstCtaMs: 900 })).toMatchObject({
      first_cta: null,
      first_cta_ms: null,
    })
  })
})

describe('user agent classification', () => {
  it('treats crawlers, link previewers and a missing UA as bots', () => {
    expect(isBotUserAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true)
    expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
    expect(isBotUserAgent('WhatsApp/2.23.20.0')).toBe(true)
    expect(isBotUserAgent(null)).toBe(true)
  })

  it('does not mistake the Facebook in-app browser for the Facebook crawler', () => {
    expect(isBotUserAgent(IPHONE_FB)).toBe(false)
  })

  it('classifies device and in-app browser', () => {
    expect(classifyDevice(IPHONE_FB)).toBe('mobile')
    expect(classifyDevice('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)')).toBe('tablet')
    expect(classifyDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0')).toBe('desktop')
    expect(classifyInApp('Mozilla/5.0 (Linux; Android 14) Instagram 330.0')).toBe('ig')
    expect(classifyInApp('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0')).toBeNull()
  })
})
