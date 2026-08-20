import { describe, it, expect, afterEach } from 'vitest'
import { getShareableBaseUrl, isLocalUrl, PRODUCTION_APP_URL } from './appUrl'

const original = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = original
})

describe('isLocalUrl', () => {
  it.each([
    'http://localhost:3000',
    'http://localhost',
    'http://127.0.0.1:3000',
    'http://0.0.0.0:8080',
    'http://macbook.local:3000',
  ])('flags %s as local', (url) => {
    expect(isLocalUrl(url)).toBe(true)
  })

  it.each(['https://www.getlessio.com', 'https://getlessio.com', 'https://lessio.vercel.app'])(
    'does not flag %s',
    (url) => {
      expect(isLocalUrl(url)).toBe(false)
    }
  )

  it('does not throw on a malformed value', () => {
    expect(isLocalUrl('not a url')).toBe(false)
  })
})

describe('getShareableBaseUrl', () => {
  it('never hands out a localhost link, even when that is what is configured', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    expect(getShareableBaseUrl()).toBe(PRODUCTION_APP_URL)
  })

  it('falls back to production when the var is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(getShareableBaseUrl()).toBe(PRODUCTION_APP_URL)
  })

  it('falls back to production when the var is blank', () => {
    process.env.NEXT_PUBLIC_APP_URL = '   '
    expect(getShareableBaseUrl()).toBe(PRODUCTION_APP_URL)
  })

  it('uses the configured origin when it is publicly reachable', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.getlessio.com'
    expect(getShareableBaseUrl()).toBe('https://staging.getlessio.com')
  })

  it('strips a trailing slash so callers can append a path', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.getlessio.com/'
    expect(`${getShareableBaseUrl()}/portal/abc`).toBe('https://www.getlessio.com/portal/abc')
  })

  it('produces a reachable parent portal link from a dev machine', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    const link = `${getShareableBaseUrl()}/portal/d2000000-0000-4000-8000-000000000000`
    expect(link).not.toContain('localhost')
    expect(link).toBe(`${PRODUCTION_APP_URL}/portal/d2000000-0000-4000-8000-000000000000`)
  })
})
