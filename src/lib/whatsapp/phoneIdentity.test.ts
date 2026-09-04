import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient, mockDecryptToken } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockDecryptToken: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/crypto', () => ({
  decryptToken: mockDecryptToken,
}))

import { getPhoneIdentity } from './phoneIdentity'

const ORG = { whatsapp_phone_number_id: 'pn-1', whatsapp_access_token: 'encrypted' }

function mockDb(org: unknown = ORG) {
  mockCreateServiceRoleClient.mockReturnValue({
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: org, error: null }),
    }),
  })
}

describe('getPhoneIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDecryptToken.mockReturnValue('plain-token')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the display number and verified name on a healthy connection', async () => {
    mockDb()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          display_phone_number: '+972 52-123-4567',
          verified_name: 'סטודיו מיכל למוזיקה',
        }),
      })
    )

    const identity = await getPhoneIdentity('org-1')
    expect(identity).toEqual({
      ok: true,
      displayPhoneNumber: '+972 52-123-4567',
      verifiedName: 'סטודיו מיכל למוזיקה',
    })
  })

  it('reports unverified when the token is dead (Graph 401)', async () => {
    mockDb()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    )

    const identity = await getPhoneIdentity('org-1')
    expect(identity.ok).toBe(false)
    expect(identity.displayPhoneNumber).toBeNull()
  })

  it('reports unverified when the org has no connection, without calling Meta', async () => {
    mockDb({ whatsapp_phone_number_id: null, whatsapp_access_token: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const identity = await getPhoneIdentity('org-1')
    expect(identity.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws on a network failure', async () => {
    mockDb()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(getPhoneIdentity('org-1')).resolves.toEqual({
      ok: false,
      displayPhoneNumber: null,
      verifiedName: null,
    })
  })

  it('treats a 200 with neither field as unverified, not as an empty identity', async () => {
    mockDb()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    const identity = await getPhoneIdentity('org-1')
    expect(identity.ok).toBe(false)
  })
})
