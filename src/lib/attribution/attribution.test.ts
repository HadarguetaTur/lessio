import { describe, expect, it } from 'vitest'

import { buildOrgAttribution, decodeTouch, encodeTouch, readTouch } from './index'

const SELF = 'getlessio.com'

function url(path: string): URL {
  return new URL(`https://${SELF}${path}`)
}

describe('readTouch', () => {
  it('returns null for direct traffic', () => {
    expect(readTouch(url('/'), null, SELF)).toBeNull()
  })

  it('ignores our own pages as a referrer', () => {
    // Otherwise every internal click would overwrite the real first touch.
    expect(readTouch(url('/signup'), `https://${SELF}/`, SELF)).toBeNull()
  })

  it('captures utm parameters and the landing path', () => {
    const touch = readTouch(
      url('/?utm_source=facebook&utm_medium=cpc&utm_campaign=launch&utm_content=video-a'),
      null,
      SELF
    )

    expect(touch).toMatchObject({
      source: 'facebook',
      medium: 'cpc',
      campaign: 'launch',
      content: 'video-a',
      landingPath: '/',
    })
  })

  it('captures click ids on their own', () => {
    // A boosted post often arrives with fbclid and no utm tags at all.
    const touch = readTouch(url('/?fbclid=IwAR123'), null, SELF)
    expect(touch?.fbclid).toBe('IwAR123')
  })

  it('keeps an external referrer', () => {
    const touch = readTouch(url('/'), 'https://news.example.com/post', SELF)
    expect(touch?.referrer).toBe('https://news.example.com/post')
  })

  it('survives an unparseable Referer header', () => {
    expect(readTouch(url('/'), 'not-a-url', SELF)).toBeNull()
  })

  it('truncates absurdly long values', () => {
    const touch = readTouch(url(`/?utm_campaign=${'a'.repeat(500)}`), null, SELF)
    expect(touch?.campaign?.length).toBe(200)
  })
})

describe('decodeTouch', () => {
  it('round-trips an encoded touch', () => {
    const touch = readTouch(url('/?utm_source=google&utm_medium=cpc'), null, SELF)!
    expect(decodeTouch(encodeTouch(touch))).toEqual(touch)
  })

  it('rejects a cookie that is not a touch', () => {
    // The cookie is attacker-controllable, so every shape must be survivable.
    expect(decodeTouch('not json')).toBeNull()
    expect(decodeTouch(encodeURIComponent('"a string"'))).toBeNull()
    expect(decodeTouch(encodeURIComponent('{"source":"x"}'))).toBeNull()
    expect(decodeTouch(undefined)).toBeNull()
  })

  it('drops non-string fields rather than trusting them', () => {
    const raw = encodeURIComponent(
      JSON.stringify({ at: '2026-08-30T00:00:00Z', source: { evil: true }, campaign: 42 })
    )
    const decoded = decodeTouch(raw)
    expect(decoded?.source).toBeUndefined()
    expect(decoded?.campaign).toBeUndefined()
    expect(decoded?.at).toBe('2026-08-30T00:00:00Z')
  })
})

describe('buildOrgAttribution', () => {
  it('is null when nothing was ever captured', () => {
    expect(
      buildOrgAttribution({ firstTouch: null, lastTouch: null, visitorId: 'v1' })
    ).toBeNull()
  })

  it('keeps first and last touch apart', () => {
    const first = readTouch(url('/?utm_source=facebook'), null, SELF)!
    const last = readTouch(url('/?utm_source=google'), null, SELF)!

    const built = buildOrgAttribution({ firstTouch: first, lastTouch: last, visitorId: 'v1' })

    expect(built).toMatchObject({ first: { source: 'facebook' }, last: { source: 'google' } })
  })

  it('falls back to first touch when there is no later one', () => {
    const first = readTouch(url('/?utm_source=facebook'), null, SELF)!
    const built = buildOrgAttribution({ firstTouch: first, lastTouch: null, visitorId: null })
    expect(built).toMatchObject({ last: { source: 'facebook' } })
  })
})
