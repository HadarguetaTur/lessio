import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateClient,
  mockCreateServiceRoleClient,
  mockRedirect,
  mockGetSupportSession,
  mockGetOrgSubscriptionState,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
  mockGetSupportSession: vi.fn().mockResolvedValue(null),
  mockGetOrgSubscriptionState: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('@/lib/support-session', () => ({
  // getSession now reads the *verified* variant, which re-checks that the
  // operator still holds support_mode.enter before honouring the cookie.
  getActiveSupportSession: mockGetSupportSession,
  getSupportSession: mockGetSupportSession,
}))

// getSession resolves whether the org subscription has lapsed, so that
// requireMutation can refuse writes without every action asking twice.
vi.mock('@/lib/saas/subscriptions', () => ({
  getOrgSubscriptionState: mockGetOrgSubscriptionState,
  isOrgSaasReadOnly: (state: unknown) =>
    state != null && (state as { status?: string }).status === 'read_only',
}))

import { getSession, requireSuperAdminSession } from './session'

function createSupabaseClient({
  user,
  profile,
}: {
  user: { id: string } | null
  profile?: { organization_id: string | null; role: string; full_name: string; is_active?: boolean } | null
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
    // Default: no active support session
    mockGetSupportSession.mockResolvedValue(null)
    // Default: a healthy subscription
    mockGetOrgSubscriptionState.mockResolvedValue(null)
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

    await expect(getSession()).resolves.toMatchObject({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin',
      fullName: 'Admin User',
      isSaasReadOnly: false,
    })
  })

  it('marks the session read-only when the subscription has lapsed', async () => {
    // This is what stops a lapsed org writing: requireMutation reads the
    // flag, so every mutating action is covered without its own guard.
    mockGetOrgSubscriptionState.mockResolvedValue({ status: 'read_only' })
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: { id: 'user-1' },
        profile: { organization_id: 'org-1', role: 'owner', full_name: 'Owner' },
      })
    )

    await expect(getSession()).resolves.toMatchObject({ isSaasReadOnly: true })
  })

  it('treats the org as writable when the subscription lookup fails', async () => {
    // Fail open: a blip in this query must not lock a paying customer out
    // of their own data, and it runs on every authenticated request.
    mockGetOrgSubscriptionState.mockRejectedValue(new Error('db down'))
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: { id: 'user-1' },
        profile: { organization_id: 'org-1', role: 'owner', full_name: 'Owner' },
      })
    )

    await expect(getSession()).resolves.toMatchObject({ isSaasReadOnly: false })
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

  it('redirects to /login when the authenticated profile is deactivated', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: { id: 'user-1' },
        profile: {
          organization_id: 'org-1',
          role: 'teacher',
          full_name: 'Archived Teacher',
          is_active: false,
        },
      })
    )

    await expect(getSession()).rejects.toThrow('REDIRECT:/login')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  // Every platform role, not just superadmin: they all have organization_id
  // NULL, and UserSession promises orgId is a non-null string. /admin is the
  // console's real index now — /admin/dashboard only redirects to it.
  it.each([
    'superadmin',
    'platform_support',
    'platform_billing',
    'platform_marketing',
    'platform_viewer',
  ])('sends a %s to the platform console', async (role) => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: { id: 'sa-1' },
        profile: { organization_id: null, role, full_name: 'Platform Staff' },
      })
    )

    await expect(getSession()).rejects.toThrow('REDIRECT:/admin')
    expect(mockRedirect).toHaveBeenCalledWith('/admin')
  })

  it('returns support-mode session when support cookie is active', async () => {
    const supportSession = {
      superAdminId: 'sa-1',
      targetOrgId: 'org-2',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
    mockGetSupportSession.mockResolvedValue(supportSession)

    const adminProfileClient = createSupabaseClient({
      user: { id: 'sa-1' },
      profile: { organization_id: null, role: 'superadmin', full_name: 'Platform Admin' },
    })
    mockCreateServiceRoleClient.mockReturnValue(adminProfileClient)

    const session = await getSession()
    expect(session.orgId).toBe('org-2')
    expect(session.isSupportMode).toBe(true)
    expect(session.role).toBe('owner')
  })
})

describe('requireSuperAdminSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSupportSession.mockResolvedValue(null)
  })

  it('returns superadmin session when role is superadmin', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: { id: 'sa-1' },
        profile: {
          organization_id: null,
          role: 'superadmin',
          full_name: 'Platform Admin',
        },
      })
    )

    await expect(requireSuperAdminSession()).resolves.toMatchObject({
      userId: 'sa-1',
      fullName: 'Platform Admin',
    })
  })

  it('redirects to /login when not authenticated', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({ user: null })
    )

    await expect(requireSuperAdminSession()).rejects.toThrow('REDIRECT:/login')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /dashboard when user is not a superadmin', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClient({
        user: { id: 'user-1' },
        profile: { organization_id: 'org-1', role: 'owner', full_name: 'Owner' },
      })
    )

    await expect(requireSuperAdminSession()).rejects.toThrow('REDIRECT:/dashboard')
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })
})
