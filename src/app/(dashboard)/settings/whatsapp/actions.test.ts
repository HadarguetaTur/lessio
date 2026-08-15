import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRevalidatePath,
  mockGetSession,
  mockRequireMutation,
  mockRequireFeature,
  mockCreateServiceRoleClient,
  mockEncryptToken,
  mockDecryptToken,
  mockRegisterTemplatesForWABA,
  mockSubscribeAppToWABA,
  mockUnsubscribeAppFromWABA,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockRequireFeature: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockEncryptToken: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockRegisterTemplatesForWABA: vi.fn(),
  mockSubscribeAppToWABA: vi.fn(),
  mockUnsubscribeAppFromWABA: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))

vi.mock('@/lib/saas/featureGate', () => ({
  requireFeature: mockRequireFeature,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/crypto', () => ({
  encryptToken: mockEncryptToken,
  decryptToken: mockDecryptToken,
}))

vi.mock('@/lib/whatsapp/registerTemplates', () => ({
  registerTemplatesForWABA: mockRegisterTemplatesForWABA,
}))

vi.mock('@/lib/whatsapp/subscribeApp', () => ({
  subscribeAppToWABA: mockSubscribeAppToWABA,
  unsubscribeAppFromWABA: mockUnsubscribeAppFromWABA,
}))

import { saveWhatsAppConnection, disconnectWhatsApp } from './actions'

const mockFetch = vi.fn()

function makeSaveFormData(overrides: Partial<Record<'phoneNumberId' | 'wabaId' | 'code', string>> = {}) {
  const formData = new FormData()
  formData.set('phoneNumberId', overrides.phoneNumberId ?? 'pn-1')
  if (overrides.wabaId !== undefined) formData.set('wabaId', overrides.wabaId)
  formData.set('code', overrides.code ?? 'oauth-code')
  return formData
}

function makeSaveDbClient(result: { error: { message: string } | null } = { error: null }) {
  const eq = vi.fn().mockResolvedValue(result)
  const update = vi.fn(() => ({ eq }))
  return {
    client: { from: vi.fn(() => ({ update })) },
    spies: { eq, update },
  }
}

function makeDisconnectDbClient(
  orgRow: { whatsapp_waba_id: string | null; whatsapp_access_token: string | null } | null,
  updateResult: { error: { message: string } | null } = { error: null }
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: orgRow })
  const selectEq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: selectEq }))
  const updateEq = vi.fn().mockResolvedValue(updateResult)
  const update = vi.fn(() => ({ eq: updateEq }))
  return {
    client: { from: vi.fn(() => ({ select, update })) },
    spies: { update, updateEq },
  }
}

describe('saveWhatsAppConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    vi.stubEnv('META_APP_ID', 'app-1')
    vi.stubEnv('META_APP_SECRET', 'secret-1')
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner', isSupportMode: false })
    mockRequireMutation.mockImplementation(() => {})
    mockRequireFeature.mockResolvedValue(undefined)
    mockSubscribeAppToWABA.mockResolvedValue(undefined)
    mockRegisterTemplatesForWABA.mockResolvedValue(undefined)
    mockEncryptToken.mockReturnValue('encrypted-token')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-1' }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('rejects a missing wabaId before any Meta call or DB write', async () => {
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await saveWhatsAppConnection({ error: null }, makeSaveFormData())

    expect(result.error).toContain('מזהה חשבון WhatsApp Business')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockSubscribeAppToWABA).not.toHaveBeenCalled()
    expect(db.spies.update).not.toHaveBeenCalled()
  })

  it('subscribes, persists all three columns and registers templates on success', async () => {
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await saveWhatsAppConnection(
      { error: null },
      makeSaveFormData({ wabaId: 'waba-1' })
    )

    expect(result).toEqual({ error: null })
    expect(mockSubscribeAppToWABA).toHaveBeenCalledWith('waba-1', 'token-1')
    expect(db.spies.update).toHaveBeenCalledWith({
      whatsapp_phone_number_id: 'pn-1',
      whatsapp_access_token: 'encrypted-token',
      whatsapp_waba_id: 'waba-1',
    })
    expect(db.spies.eq).toHaveBeenCalledWith('id', 'org-1')
    expect(mockRegisterTemplatesForWABA).toHaveBeenCalledWith('waba-1', 'token-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/whatsapp')
  })

  it('returns an error and persists nothing when the WABA subscription fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockSubscribeAppToWABA.mockRejectedValue(new Error('subscribe failed'))

    const result = await saveWhatsAppConnection(
      { error: null },
      makeSaveFormData({ wabaId: 'waba-1' })
    )

    expect(result.error).toContain('רישום ה-webhook מול Meta נכשל')
    expect(db.spies.update).not.toHaveBeenCalled()
    expect(mockRegisterTemplatesForWABA).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('rejects non-owner sessions', async () => {
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'admin', isSupportMode: false })

    const result = await saveWhatsAppConnection(
      { error: null },
      makeSaveFormData({ wabaId: 'waba-1' })
    )

    expect(result.error).toBe('אין הרשאה לביצוע פעולה זו')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('disconnectWhatsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner', isSupportMode: false })
    mockRequireMutation.mockImplementation(() => {})
    mockRequireFeature.mockResolvedValue(undefined)
    mockDecryptToken.mockReturnValue('decrypted-token')
    mockUnsubscribeAppFromWABA.mockResolvedValue(undefined)
  })

  it('unsubscribes the WABA and clears all three columns', async () => {
    const db = makeDisconnectDbClient({
      whatsapp_waba_id: 'waba-1',
      whatsapp_access_token: 'encrypted-token',
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await disconnectWhatsApp({ error: null }, new FormData())

    expect(result).toEqual({ error: null })
    expect(mockDecryptToken).toHaveBeenCalledWith('encrypted-token')
    expect(mockUnsubscribeAppFromWABA).toHaveBeenCalledWith('waba-1', 'decrypted-token')
    expect(db.spies.update).toHaveBeenCalledWith({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      whatsapp_waba_id: null,
    })
  })

  it('still disconnects when the Meta unsubscribe fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeDisconnectDbClient({
      whatsapp_waba_id: 'waba-1',
      whatsapp_access_token: 'encrypted-token',
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockUnsubscribeAppFromWABA.mockRejectedValue(new Error('meta down'))

    const result = await disconnectWhatsApp({ error: null }, new FormData())

    expect(result).toEqual({ error: null })
    expect(db.spies.update).toHaveBeenCalledWith({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      whatsapp_waba_id: null,
    })

    consoleErrorSpy.mockRestore()
  })

  it('skips the unsubscribe when no WABA id is stored', async () => {
    const db = makeDisconnectDbClient({
      whatsapp_waba_id: null,
      whatsapp_access_token: 'encrypted-token',
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await disconnectWhatsApp({ error: null }, new FormData())

    expect(result).toEqual({ error: null })
    expect(mockUnsubscribeAppFromWABA).not.toHaveBeenCalled()
    expect(db.spies.update).toHaveBeenCalled()
  })
})
