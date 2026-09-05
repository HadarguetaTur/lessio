import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCookies, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: mockCookies }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { getPortalSession, signPortalSession } from './session'

const PARENT_A = '11111111-1111-1111-1111-111111111111'
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

/** Stands in for the single parents lookup getPortalSession makes. */
function mockParentRow(row: { organization_id: string; is_active: boolean | null } | null) {
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: row ? { id: PARENT_A, ...row } : null,
            error: null,
          }),
        })),
      })),
    })),
  })
}

async function cookieFor(session: { parentId: string; orgId: string }) {
  const token = await signPortalSession(session)
  mockCookies.mockResolvedValue({ get: vi.fn(() => ({ value: token })) })
}

describe('getPortalSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PORTAL_JWT_SECRET = 'test-secret-at-least-32-characters-long'
  })

  it('returns the session for an active parent of the claimed org', async () => {
    await cookieFor({ parentId: PARENT_A, orgId: ORG_A })
    mockParentRow({ organization_id: ORG_A, is_active: true })

    expect(await getPortalSession()).toEqual({ parentId: PARENT_A, orgId: ORG_A })
  })

  it('treats a null is_active as active, since the column is nullable', async () => {
    await cookieFor({ parentId: PARENT_A, orgId: ORG_A })
    mockParentRow({ organization_id: ORG_A, is_active: null })

    expect(await getPortalSession()).not.toBeNull()
  })

  it('revokes a deactivated parent rather than waiting out the 7-day expiry', async () => {
    await cookieFor({ parentId: PARENT_A, orgId: ORG_A })
    mockParentRow({ organization_id: ORG_A, is_active: false })

    expect(await getPortalSession()).toBeNull()
  })

  it('revokes a parent whose row is gone', async () => {
    await cookieFor({ parentId: PARENT_A, orgId: ORG_A })
    mockParentRow(null)

    expect(await getPortalSession()).toBeNull()
  })

  it('refuses a cookie whose org claim does not match the parent row', async () => {
    // The orgId in the cookie is asserted by whoever holds it. A validly signed
    // token naming another tenant must not open that tenant's portal.
    await cookieFor({ parentId: PARENT_A, orgId: ORG_B })
    mockParentRow({ organization_id: ORG_A, is_active: true })

    expect(await getPortalSession()).toBeNull()
  })

  it('returns null with no cookie, and never asks the database', async () => {
    mockCookies.mockResolvedValue({ get: vi.fn(() => undefined) })

    expect(await getPortalSession()).toBeNull()
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('returns null for a token signed with a different secret', async () => {
    await cookieFor({ parentId: PARENT_A, orgId: ORG_A })
    process.env.PORTAL_JWT_SECRET = 'a-completely-different-secret-value-32'
    mockParentRow({ organization_id: ORG_A, is_active: true })

    expect(await getPortalSession()).toBeNull()
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })
})
