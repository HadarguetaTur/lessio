import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRevalidatePath,
  mockGetSession,
  mockRequireMutation,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))
vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: async (key: string) => key,
  zodError: async () => 'invalidData',
}))

import { saveParentPortalSettings } from './actions'

function makeDbClient(result: { error: { message: string } | null } = { error: null }) {
  const eq = vi.fn().mockResolvedValue(result)
  const update = vi.fn(() => ({ eq }))
  return { client: { from: vi.fn(() => ({ update })) }, spies: { eq, update } }
}

/** Only ticked boxes reach the action — an unchecked one submits nothing. */
function form(checked: string[]) {
  const fd = new FormData()
  for (const name of checked) fd.set(name, 'on')
  return fd
}

const ALL_ON = [
  'enabled',
  'payments',
  'homework',
  'exams',
  'progress',
  'messages',
  'booking',
  'cancellation',
]

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks keeps implementations, and one test makes this throw.
  mockRequireMutation.mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner' })
})

describe('saveParentPortalSettings', () => {
  it('writes every toggle, so an absent key never means "off" by accident', async () => {
    const { client, spies } = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(client)

    const result = await saveParentPortalSettings({ error: null }, form(ALL_ON))

    expect(result).toEqual({ error: null, success: true })
    expect(spies.update).toHaveBeenCalledWith({
      portal_settings: {
        enabled: true,
        payments: true,
        homework: true,
        exams: true,
        progress: true,
        messages: true,
        booking: true,
        cancellation: true,
      },
    })
    expect(spies.eq).toHaveBeenCalledWith('id', 'org-1')
  })

  it('records an unticked box as false rather than dropping the key', async () => {
    const { client, spies } = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(client)

    await saveParentPortalSettings(
      { error: null },
      form(ALL_ON.filter((n) => n !== 'payments' && n !== 'homework'))
    )

    expect(spies.update).toHaveBeenCalledWith({
      portal_settings: expect.objectContaining({
        enabled: true,
        payments: false,
        homework: false,
        exams: true,
      }),
    })
  })

  // Closing the portal must not wipe the feature choices: reopening it should
  // restore exactly the set the owner had.
  it('keeps the per-feature choices when the master switch goes off', async () => {
    const { client, spies } = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(client)

    await saveParentPortalSettings({ error: null }, form(ALL_ON.filter((n) => n !== 'enabled')))

    expect(spies.update).toHaveBeenCalledWith({
      portal_settings: expect.objectContaining({ enabled: false, payments: true, booking: true }),
    })
  })

  it('lets an admin save, and refuses a teacher', async () => {
    const { client, spies } = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(client)

    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'admin' })
    expect(await saveParentPortalSettings({ error: null }, form(ALL_ON))).toEqual({
      error: null,
      success: true,
    })

    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'teacher' })
    expect(await saveParentPortalSettings({ error: null }, form(ALL_ON))).toEqual({
      error: 'noPermission',
    })
    expect(spies.update).toHaveBeenCalledTimes(1)
  })

  // A superadmin in support mode is read-only; requireMutation throws.
  it('goes through the support-mode guard before writing', async () => {
    const { client, spies } = makeDbClient()
    mockCreateServiceRoleClient.mockReturnValue(client)
    mockRequireMutation.mockImplementation(() => {
      throw new Error('SUPPORT_MODE_READ_ONLY')
    })

    await expect(saveParentPortalSettings({ error: null }, form(ALL_ON))).rejects.toThrow(
      'SUPPORT_MODE_READ_ONLY'
    )
    expect(spies.update).not.toHaveBeenCalled()
  })

  it('reports a failed write instead of claiming success', async () => {
    const { client } = makeDbClient({ error: { message: 'boom' } })
    mockCreateServiceRoleClient.mockReturnValue(client)

    const result = await saveParentPortalSettings({ error: null }, form(ALL_ON))

    expect(result.success).toBeUndefined()
    expect(result.error).toBe('settings.parentPortal.errors.saveFailed')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
