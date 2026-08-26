import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRevalidatePath,
  mockGetSession,
  mockRequireMutation,
  mockCreateServiceRoleClient,
  mockForbidden,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockForbidden: vi.fn(() => {
    throw new Error('forbidden')
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next/navigation', () => ({ forbidden: mockForbidden }))
vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}))

import { setReceiptModeAction, disconnectReceiptAction } from './actions'

function makeDbClient(result: { error: { message: string } | null } = { error: null }) {
  const eq = vi.fn().mockResolvedValue(result)
  const update = vi.fn(() => ({ eq }))
  return { client: { from: vi.fn(() => ({ update })) }, spies: { eq, update } }
}

describe('setReceiptModeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      orgId: 'org-1',
      profileId: 'profile-1',
      role: 'owner',
      isSupportMode: false,
    })
    mockRequireMutation.mockImplementation(() => {})
  })

  it("records 'external' without touching stored credentials", async () => {
    const db = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await setReceiptModeAction('external')

    expect(db.spies.update).toHaveBeenCalledWith({ receipt_mode: 'external' })
    expect(db.spies.eq).toHaveBeenCalledWith('id', 'org-1')
  })

  // The whole point of the screen: an org that says someone else issues its
  // invoices must not keep credentials that could start issuing a second one.
  it("clears credentials when the payment provider issues the invoices", async () => {
    const db = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await setReceiptModeAction('payment_provider')

    expect(db.spies.update).toHaveBeenCalledWith({
      receipt_mode: 'payment_provider',
      receipt_provider: null,
      receipt_config_encrypted: null,
    })
  })

  it("clears credentials when the org issues nothing through Lessio", async () => {
    const db = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await setReceiptModeAction('none')

    expect(db.spies.update).toHaveBeenCalledWith({
      receipt_mode: 'none',
      receipt_provider: null,
      receipt_config_encrypted: null,
    })
  })

  it('rejects a mode outside the three known answers', async () => {
    const db = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await setReceiptModeAction('whatever' as never)

    expect(result.error).toBeTruthy()
    expect(db.spies.update).not.toHaveBeenCalled()
  })

  it('is owner-only', async () => {
    mockGetSession.mockResolvedValue({
      orgId: 'org-1',
      profileId: 'profile-1',
      role: 'admin',
      isSupportMode: false,
    })
    mockCreateServiceRoleClient.mockReturnValue(makeDbClient().client)

    await expect(setReceiptModeAction('none')).rejects.toThrow('forbidden')
  })

  it('surfaces a DB failure instead of reporting success', async () => {
    const db = makeDbClient({ error: { message: 'boom' } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await setReceiptModeAction('none')

    expect(result.error).toBeTruthy()
  })
})

describe('disconnectReceiptAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      orgId: 'org-1',
      profileId: 'profile-1',
      role: 'owner',
      isSupportMode: false,
    })
    mockRequireMutation.mockImplementation(() => {})
  })

  // Returning to "unanswered" is what makes the chooser ask again, rather than
  // leaving the org in a mode whose credentials have been deleted.
  it('clears the answer along with the credentials', async () => {
    const db = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await disconnectReceiptAction()

    expect(db.spies.update).toHaveBeenCalledWith({
      receipt_provider: null,
      receipt_config_encrypted: null,
      receipt_mode: null,
    })
  })
})
