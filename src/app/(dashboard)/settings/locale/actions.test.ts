import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRevalidatePath,
  mockGetSession,
  mockRequireMutation,
  mockCreateServiceRoleClient,
  mockCookiesSet,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCookiesSet: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookiesSet }),
}))

import { saveLocaleAction, saveOrgDefaultLocaleAction } from './actions'

function makeDbClient(result: { error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result)
  const update = vi.fn(() => ({ eq }))
  return {
    client: { from: vi.fn(() => ({ update })) },
    spies: { eq, update },
  }
}

describe('saveLocaleAction', () => {
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

  it("saves locale 'en' — updates profile + sets cookie + revalidates", async () => {
    const db = makeDbClient({ error: null })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const formData = new FormData()
    formData.set('locale', 'en')

    await saveLocaleAction(formData)

    expect(db.spies.update).toHaveBeenCalledWith({ preferred_locale: 'en' })
    expect(db.spies.eq).toHaveBeenCalledWith('id', 'profile-1')
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'locale',
      'en',
      expect.objectContaining({ path: '/', httpOnly: false }),
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it("saves locale 'he' — updates profile + sets cookie", async () => {
    const db = makeDbClient({ error: null })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const formData = new FormData()
    formData.set('locale', 'he')

    await saveLocaleAction(formData)

    expect(db.spies.update).toHaveBeenCalledWith({ preferred_locale: 'he' })
    expect(mockCookiesSet).toHaveBeenCalledWith('locale', 'he', expect.any(Object))
  })

  it('blocks support-mode mutations via requireMutation', async () => {
    mockRequireMutation.mockImplementation(() => {
      throw new Error('מצב תמיכה הוא קריאה בלבד. פעולות עריכה אינן מותרות.')
    })

    const formData = new FormData()
    formData.set('locale', 'en')

    await expect(saveLocaleAction(formData)).rejects.toThrow('מצב תמיכה')
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('ignores invalid locale values (Zod validation guard)', async () => {
    const formData = new FormData()
    formData.set('locale', 'fr')

    await saveLocaleAction(formData)

    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
    expect(mockCookiesSet).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

describe('saveOrgDefaultLocaleAction', () => {
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

  it('writes organizations.default_locale for the session org', async () => {
    const db = makeDbClient({ error: null })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const formData = new FormData()
    formData.set('locale', 'en')

    await saveOrgDefaultLocaleAction(formData)

    expect(db.client.from).toHaveBeenCalledWith('organizations')
    expect(db.spies.update).toHaveBeenCalledWith({ default_locale: 'en' })
    expect(db.spies.eq).toHaveBeenCalledWith('id', 'org-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/locale')
  })

  it('refuses non-owner roles — the fallback affects every parent in the org', async () => {
    mockGetSession.mockResolvedValue({
      orgId: 'org-1',
      profileId: 'profile-1',
      role: 'admin',
      isSupportMode: false,
    })

    const formData = new FormData()
    formData.set('locale', 'en')

    await saveOrgDefaultLocaleAction(formData)

    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('blocks support-mode mutations via requireMutation', async () => {
    mockRequireMutation.mockImplementation(() => {
      throw new Error('מצב תמיכה הוא קריאה בלבד. פעולות עריכה אינן מותרות.')
    })

    const formData = new FormData()
    formData.set('locale', 'en')

    await expect(saveOrgDefaultLocaleAction(formData)).rejects.toThrow('מצב תמיכה')
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('ignores invalid locale values', async () => {
    const formData = new FormData()
    formData.set('locale', 'fr')

    await saveOrgDefaultLocaleAction(formData)

    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
