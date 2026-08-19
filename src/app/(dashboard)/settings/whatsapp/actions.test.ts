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
  mockInspectAccessToken,
  mockRegisterPhoneNumber,
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
  mockInspectAccessToken: vi.fn(),
  mockRegisterPhoneNumber: vi.fn(),
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

vi.mock('@/lib/whatsapp/debugToken', () => ({
  inspectAccessToken: mockInspectAccessToken,
}))

vi.mock('@/lib/whatsapp/registerPhone', () => ({
  registerPhoneNumber: mockRegisterPhoneNumber,
  // Kept real: the action uses it to reject a malformed env var before any
  // network call, which is behaviour worth exercising rather than stubbing.
  isValidRegisterPin: (pin: string) => /^\d{6}$/.test(pin),
}))

import { saveWhatsAppConnection, disconnectWhatsApp, registerTemplates } from './actions'

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
    vi.stubEnv('WHATSAPP_REGISTER_PIN', '123456')
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner', isSupportMode: false })
    mockRequireMutation.mockImplementation(() => {})
    mockRequireFeature.mockResolvedValue(undefined)
    mockSubscribeAppToWABA.mockResolvedValue(undefined)
    mockRegisterTemplatesForWABA.mockResolvedValue(undefined)
    mockEncryptToken.mockReturnValue('encrypted-token')
    mockInspectAccessToken.mockResolvedValue({ missingScopes: [], managedWabaIds: ['waba-1'] })
    mockRegisterPhoneNumber.mockResolvedValue(undefined)
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

  it('verifies the granted scopes and registers the number on Cloud API', async () => {
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await saveWhatsAppConnection({ error: null }, makeSaveFormData({ wabaId: 'waba-1' }))

    expect(mockInspectAccessToken).toHaveBeenCalledWith('token-1', 'app-1', 'secret-1')
    expect(mockRegisterPhoneNumber).toHaveBeenCalledWith('pn-1', 'token-1', '123456')
  })

  it('exchanges the code without a redirect_uri', async () => {
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await saveWhatsAppConnection({ error: null }, makeSaveFormData({ wabaId: 'waba-1' }))

    // An Embedded Signup code comes from FB.login, not a redirect, so sending a
    // redirect_uri only gives Meta something to reject it against.
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/oauth/access_token?')
    expect(url).not.toContain('redirect_uri')
  })

  it('persists nothing when Meta withheld a required scope', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockInspectAccessToken.mockResolvedValue({
      missingScopes: ['whatsapp_business_management'],
      managedWabaIds: [],
    })

    const result = await saveWhatsAppConnection(
      { error: null },
      makeSaveFormData({ wabaId: 'waba-1' })
    )

    expect(result.error).toContain('whatsapp_business_management')
    expect(mockSubscribeAppToWABA).not.toHaveBeenCalled()
    expect(mockRegisterPhoneNumber).not.toHaveBeenCalled()
    expect(db.spies.update).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('rejects a wabaId the token was never scoped to', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockInspectAccessToken.mockResolvedValue({
      missingScopes: [],
      managedWabaIds: ['waba-someone-else'],
    })

    const result = await saveWhatsAppConnection(
      { error: null },
      makeSaveFormData({ wabaId: 'waba-1' })
    )

    expect(result.error).toBeTruthy()
    expect(mockSubscribeAppToWABA).not.toHaveBeenCalled()
    expect(db.spies.update).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('accepts the wabaId when Meta reports the scope ungranularly', async () => {
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockInspectAccessToken.mockResolvedValue({ missingScopes: [], managedWabaIds: [] })

    const result = await saveWhatsAppConnection(
      { error: null },
      makeSaveFormData({ wabaId: 'waba-1' })
    )

    expect(result).toEqual({ error: null })
    expect(db.spies.update).toHaveBeenCalled()
  })

  it('persists nothing when the phone number cannot be registered', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockRegisterPhoneNumber.mockRejectedValue(new Error('register failed'))

    const result = await saveWhatsAppConnection(
      { error: null },
      makeSaveFormData({ wabaId: 'waba-1' })
    )

    expect(result.error).toBeTruthy()
    expect(db.spies.update).not.toHaveBeenCalled()
    expect(mockRegisterTemplatesForWABA).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('fails before any Meta call when the register PIN is not six digits', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('WHATSAPP_REGISTER_PIN', '12ab')
    const db = makeSaveDbClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await saveWhatsAppConnection(
      { error: null },
      makeSaveFormData({ wabaId: 'waba-1' })
    )

    expect(result.error).toBeTruthy()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(db.spies.update).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
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

describe('registerTemplates', () => {
  const initialState = { error: null, registered: [], failed: [] }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner', isSupportMode: false })
    mockRequireMutation.mockImplementation(() => {})
    mockRequireFeature.mockResolvedValue(undefined)
    mockDecryptToken.mockReturnValue('decrypted-token')
  })

  it('registers on the stored WABA with the decrypted token', async () => {
    const db = makeDisconnectDbClient({
      whatsapp_waba_id: 'waba-1',
      whatsapp_access_token: 'encrypted-token',
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockRegisterTemplatesForWABA.mockResolvedValue({ ok: ['lessio_menu_en_v3'], failed: [] })

    const result = await registerTemplates(initialState, new FormData())

    expect(mockDecryptToken).toHaveBeenCalledWith('encrypted-token')
    expect(mockRegisterTemplatesForWABA).toHaveBeenCalledWith('waba-1', 'decrypted-token')
    expect(result).toEqual({ error: null, registered: ['lessio_menu_en_v3'], failed: [] })
  })

  it('surfaces per-template failures instead of swallowing them', async () => {
    const db = makeDisconnectDbClient({
      whatsapp_waba_id: 'waba-1',
      whatsapp_access_token: 'encrypted-token',
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockRegisterTemplatesForWABA.mockResolvedValue({
      ok: ['lessio_menu_en_v3'],
      failed: [{ name: 'lessio_otp_he', reason: 'Error: 400 invalid components' }],
    })

    const result = await registerTemplates(initialState, new FormData())

    expect(result.error).toBeNull()
    expect(result.failed).toEqual([
      { name: 'lessio_otp_he', reason: 'Error: 400 invalid components' },
    ])
  })

  it('reports notConnected when no WABA is stored', async () => {
    const db = makeDisconnectDbClient({
      whatsapp_waba_id: null,
      whatsapp_access_token: 'encrypted-token',
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await registerTemplates(initialState, new FormData())

    expect(result).toEqual({ error: 'notConnected', registered: [], failed: [] })
    expect(mockRegisterTemplatesForWABA).not.toHaveBeenCalled()
  })

  it('rejects non-owner sessions before touching the DB', async () => {
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'admin', isSupportMode: false })

    const result = await registerTemplates(initialState, new FormData())

    expect(result).toEqual({ error: 'forbidden', registered: [], failed: [] })
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
    expect(mockRegisterTemplatesForWABA).not.toHaveBeenCalled()
  })

  it('reports decryptFailed rather than throwing when the stored token is unreadable', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeDisconnectDbClient({
      whatsapp_waba_id: 'waba-1',
      whatsapp_access_token: 'corrupt',
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockDecryptToken.mockImplementation(() => {
      throw new Error('bad key')
    })

    const result = await registerTemplates(initialState, new FormData())

    expect(result).toEqual({ error: 'decryptFailed', registered: [], failed: [] })
    expect(mockRegisterTemplatesForWABA).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
