import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDb = {
  from: vi.fn(),
  auth: { admin: { inviteUserByEmail: vi.fn(), deleteUser: vi.fn() } },
}

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockDb,
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

import { createOrganization } from './createOrganization'

function makeChainFor(returnValue: unknown) {
  const chain: Record<string, unknown> = {}
  chain.insert    = vi.fn(() => chain)
  chain.upsert    = vi.fn().mockResolvedValue({ error: null })
  chain.select    = vi.fn(() => chain)
  chain.eq        = vi.fn(() => chain)
  chain.single    = vi.fn().mockResolvedValue(returnValue)
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null })  // no slug collision
  return chain
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates org, default policy, invites owner, inserts profile and returns orgId', async () => {
    const orgChain = makeChainFor({ data: { id: 'org-1' }, error: null })
    const policyChain = makeChainFor({ data: null, error: null })

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'organizations') return orgChain
      if (table === 'cancellation_policies') return policyChain
      if (table === 'profiles') return makeChainFor({ data: null, error: null })
      if (table === 'saas_plans') {
        const chain = makeChainFor({ data: null, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'plan-free' } })
        return chain
      }
      if (table === 'teachers' || table === 'organization_subscriptions') {
        return makeChainFor({ data: null, error: null })
      }
      return makeChainFor({ data: null, error: null })
    })

    mockDb.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'owner-1' } },
      error: null,
    })

    const result = await createOrganization({
      name: 'Test Org',
      timezone: 'Asia/Jerusalem',
      owner_email: 'owner@test.com',
      owner_full_name: 'Test Owner',
    })

    expect(result).toEqual({ success: true, orgId: 'org-1' })
    expect(mockDb.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'owner@test.com',
      expect.objectContaining({ data: expect.objectContaining({ full_name: 'Test Owner' }) })
    )
  })

  it('deletes org and returns error when invite fails', async () => {
    const orgChain = makeChainFor({ data: { id: 'org-1' }, error: null })
    const deleteChain = { delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'organizations') return { ...orgChain, ...deleteChain }
      if (table === 'cancellation_policies') return makeChainFor({ data: null, error: null })
      return makeChainFor({ data: null, error: null })
    })

    mockDb.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: 'email already in use' },
    })

    const result = await createOrganization({
      name: 'Test Org',
      timezone: 'Asia/Jerusalem',
      owner_email: 'taken@test.com',
      owner_full_name: 'Test Owner',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('email already in use')
    }
    // Compensating delete was called
    expect(deleteChain.delete).toHaveBeenCalled()
  })

  it('deletes user and org when profile insert fails', async () => {
    const deleteOrgChain = { delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }
    const profileInsertChain = { insert: vi.fn().mockResolvedValue({ error: { message: 'duplicate key' } }) }

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'organizations') return { ...makeChainFor({ data: { id: 'org-1' }, error: null }), ...deleteOrgChain }
      if (table === 'cancellation_policies') return makeChainFor({ data: null, error: null })
      if (table === 'profiles') return profileInsertChain
      return makeChainFor({ data: null, error: null })
    })

    mockDb.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'owner-1' } },
      error: null,
    })
    mockDb.auth.admin.deleteUser.mockResolvedValue({ error: null })

    const result = await createOrganization({
      name: 'Test Org',
      timezone: 'Asia/Jerusalem',
      owner_email: 'owner@test.com',
      owner_full_name: 'Test Owner',
    })

    expect(result.success).toBe(false)
    expect(mockDb.auth.admin.deleteUser).toHaveBeenCalledWith('owner-1')
    expect(deleteOrgChain.delete).toHaveBeenCalled()
  })
})
