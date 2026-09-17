import { describe, expect, it } from 'vitest'

import {
  brokenLinkDestination,
  buildShortLinkDestination,
  isSafeTargetPath,
  type ShortLinkTarget,
} from './shortLink'

const LINK: ShortLinkTarget = {
  target_path: '/tutors',
  utm_source: 'facebook',
  utm_medium: 'group',
  utm_campaign: 'close-september',
  utm_content: 'morim-tlv',
  utm_term: null,
}

describe('buildShortLinkDestination', () => {
  it('attaches the stored UTM values and names the link', () => {
    const dest = buildShortLinkDestination('morim-tlv', LINK, new URLSearchParams())
    const url = new URL(dest, 'https://x.test')

    expect(url.pathname).toBe('/tutors')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'facebook',
      utm_medium: 'group',
      utm_campaign: 'close-september',
      utm_content: 'morim-tlv',
      ls_link: 'morim-tlv',
    })
  })

  it('passes the click ids through, and nothing else from the incoming query', () => {
    const incoming = new URLSearchParams({ fbclid: 'abc', utm_source: 'spoofed', next: 'https://evil.test' })
    const url = new URL(buildShortLinkDestination('morim-tlv', LINK, incoming), 'https://x.test')

    expect(url.searchParams.get('fbclid')).toBe('abc')
    expect(url.searchParams.get('utm_source')).toBe('facebook')
    expect(url.searchParams.has('next')).toBe(false)
  })

  it.each(['//evil.test/x', '/\\evil.test', 'https://evil.test', 'javascript:alert(1)', ''])(
    'never leaves the origin for target %j',
    (target) => {
      const dest = buildShortLinkDestination('s1', { ...LINK, target_path: target }, new URLSearchParams())
      expect(dest.startsWith('/?')).toBe(true)
      expect(new URL(dest, 'https://self.test').origin).toBe('https://self.test')
    }
  )
})

describe('isSafeTargetPath', () => {
  it('accepts relative paths only', () => {
    expect(isSafeTargetPath('/')).toBe(true)
    expect(isSafeTargetPath('/tutors')).toBe(true)
    expect(isSafeTargetPath('//evil.test')).toBe(false)
    expect(isSafeTargetPath('/\\evil.test')).toBe(false)
    expect(isSafeTargetPath('tutors')).toBe(false)
  })
})

describe('brokenLinkDestination', () => {
  it('lands on the home page, tagged so the broken link shows in the report', () => {
    const url = new URL(brokenLinkDestination('old-post'), 'https://x.test')
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('utm_medium')).toBe('broken-link')
    expect(url.searchParams.get('utm_content')).toBe('old-post')
  })
})
