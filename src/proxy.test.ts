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

import { proxy } from './proxy'

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
})
