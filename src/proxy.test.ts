import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockCreateServerClient } = vi.hoisted(() => {
  const getUser = vi.fn()
  return {
    mockGetUser: getUser,
    mockCreateServerClient: vi.fn(() => ({
      auth: {
        getUser,
      },
    })),
  }
})

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

import { buildForwardedHeaders, PATHNAME_HEADER, proxy } from './proxy'

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('bypasses /book routes without creating a Supabase client', async () => {
    const request = new NextRequest('http://localhost:3000/book/token-123')

    const response = await proxy(request)

    expect(response.status).toBe(200)
    expect(mockCreateServerClient).not.toHaveBeenCalled()
  })

  // The portal previously 301'd /portal/* → /he/portal/*. Middleware runs on every
  // method, so Server Action POSTs were redirected too — browsers downgrade those to
  // GET and drop the body, which made OTP verification (and therefore portal login)
  // impossible. These lock the pass-through in.
  describe('parent portal', () => {
    const ORG_ID = '11111111-1111-1111-1111-111111111111'

    it('serves /portal/:orgId directly, with no redirect', async () => {
      const request = new NextRequest(`http://localhost:3000/portal/${ORG_ID}`)

      const response = await proxy(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
      expect(mockCreateServerClient).not.toHaveBeenCalled()
    })

    it('does not redirect a Server Action POST to the portal login route', async () => {
      const request = new NextRequest(
        `http://localhost:3000/portal/${ORG_ID}/login?step=verify&phone=%2B972500000000`,
        { method: 'POST' }
      )

      const response = await proxy(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
    })

    it('does not redirect nested portal routes', async () => {
      const request = new NextRequest(`http://localhost:3000/portal/${ORG_ID}/home`)

      const response = await proxy(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
    })

    it('still passes legacy /he/portal links through (rewritten in next.config.ts)', async () => {
      const request = new NextRequest(`http://localhost:3000/he/portal/${ORG_ID}/home`)

      const response = await proxy(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
      expect(mockCreateServerClient).not.toHaveBeenCalled()
    })
  })

  it('redirects unauthenticated dashboard requests to /login', async () => {
    const request = new NextRequest('http://localhost:3000/dashboard')

    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login')
  })

  it('redirects authenticated users away from /login to /dashboard', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const request = new NextRequest('http://localhost:3000/login')

    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
  })

  it('allows unauthenticated requests to / through the proxy', async () => {
    const request = new NextRequest('http://localhost:3000/')

    const response = await proxy(request)

    expect(response.status).toBe(200)
  })

  it('redirects authenticated users from / to /dashboard', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const request = new NextRequest('http://localhost:3000/')

    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
  })

  it('redirects authenticated users from /signup to /dashboard', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const request = new NextRequest('http://localhost:3000/signup')

    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
  })

  it('redirects unauthenticated /teacher/schedule requests to /login', async () => {
    const request = new NextRequest('http://localhost:3000/teacher/schedule')

    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login')
  })

  it('forwards the x-pathname header so server components can read the current path', async () => {
    const request = new NextRequest('http://localhost:3000/teacher/schedule')
    const headers = buildForwardedHeaders(request)

    expect(headers.get(PATHNAME_HEADER)).toBe('/teacher/schedule')
  })

  it('allows authenticated teacher routes through the proxy', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const request = new NextRequest('http://localhost:3000/teacher/schedule')

    const response = await proxy(request)

    expect(response.status).toBe(200)
  })
})
