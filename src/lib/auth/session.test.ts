import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateClient, mockRedirect } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { getSession } from './session'

function createSupabaseClient({
  user,
  profile,
}: {
  user: { id: string } | null
  profile?: { organization_id: string; role: string; full_name: string } | null
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: profile ?? null }),
        })),
      })),
    })),
  }
}

describe('getSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the dashboard session when user and profile exist', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: { id: 'user-1' },
        profile: {
          organization_id: 'org-1',
          role: 'admin',
          full_name: 'Admin User',
        },
      })
    )

    await expect(getSession()).resolves.toEqual({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin',
      fullName: 'Admin User',
    })
  })

  it('redirects to /login when there is no authenticated user', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: null,
      })
    )

    await expect(getSession()).rejects.toThrow('REDIRECT:/login')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login when the profile row is missing', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: { id: 'user-1' },
        profile: null,
      })
    )

    await expect(getSession()).rejects.toThrow('REDIRECT:/login')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
