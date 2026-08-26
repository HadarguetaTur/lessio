import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateServiceRoleClient,
  mockDecryptToken,
  mockGetPaymentProvider,
  mockSendPaymentWithButton,
} = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockGetPaymentProvider: vi.fn(),
  mockSendPaymentWithButton: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/crypto', () => ({
  decryptToken: mockDecryptToken,
}))

vi.mock('@/lib/payments/factory', () => ({
  getPaymentProvider: mockGetPaymentProvider,
}))

// The opt-out gate and the window-vs-template decision both live inside
// sendPaymentWithButton now, so that is the boundary this test asserts against.
vi.mock('@/lib/whatsapp/sendSmart', () => ({
  sendPaymentWithButton: mockSendPaymentWithButton,
}))

import { autoSendPaymentRequest } from './autoSend'

function makeOrgRow(overrides: Record<string, unknown> = {}) {
  return {
    auto_send_payment_request: true,
    automation_payment_request_enabled: true,
    payment_provider: 'cardcom',
    whatsapp_phone_number_id: 'pn-1',
    whatsapp_access_token: 'encrypted-token',
    timezone: 'Asia/Jerusalem',
    ...overrides,
  }
}

function makeDbClient(orgRow: Record<string, unknown>) {
  const queriedTables: string[] = []
  const client = {
    from: vi.fn((table: string) => {
      queriedTables.push(table)
      const single = vi.fn().mockResolvedValue({
        data: table === 'organizations' ? orgRow : null,
      })
      const chain: Record<string, unknown> = {}
      const pass = () => chain
      ;['select', 'eq', 'update'].forEach((m) => { chain[m] = pass })
      chain['single'] = single
      return chain
    }),
  }
  return { client, queriedTables }
}

/**
 * Reaches the actual send: organizations → charges → parents all resolve.
 * The single-row shape mirrors makeDbClient but returns a row per table.
 */
function makeSendableDbClient(orgRow: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = []
  const rows: Record<string, unknown> = {
    organizations: orgRow,
    charges: { id: 'charge-1', amount: 250, charge_type: 'lesson', parent_id: 'parent-1', lessons: { start_at: '2026-08-21T13:00:00Z' } },
    parents: { id: 'parent-1', full_name: 'דנה כהן', phone: '+972501234567', preferred_locale: 'he' },
  }
  const client = {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {}
      const pass = () => chain
      chain['select'] = pass
      chain['eq'] = pass
      chain['update'] = vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload)
        return chain
      })
      chain['single'] = vi.fn().mockResolvedValue({ data: rows[table] ?? null })
      chain['then'] = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    }),
  }
  return { client, updates }
}

describe('autoSendPaymentRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPaymentWithButton.mockResolvedValue({ sent: true })
    mockDecryptToken.mockReturnValue('plain-token')
    mockGetPaymentProvider.mockResolvedValue({
      providerName: 'cardcom',
      provider: { createPaymentLink: vi.fn().mockResolvedValue({ url: 'https://pay.example.com/1', reference: 'ref-1' }) },
    })
  })

  it('skips when automation_payment_request_enabled is off', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const db = makeDbClient(makeOrgRow({ automation_payment_request_enabled: false }))
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await autoSendPaymentRequest('lesson-1', 'org-1')

    expect(db.queriedTables).toEqual(['organizations'])
    expect(mockGetPaymentProvider).not.toHaveBeenCalled()

    consoleInfoSpy.mockRestore()
  })

  it('proceeds past the toggle when it is on', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = makeDbClient(makeOrgRow())
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await autoSendPaymentRequest('lesson-1', 'org-1')

    // Charge lookup returns null → exits with a warning, but the toggle gate was passed
    expect(db.queriedTables).toContain('charges')

    consoleWarnSpy.mockRestore()
  })

  // This path used to send raw text, which bypassed the opt-out gate entirely
  // — an opted-out parent still got an automatic payment request after every
  // completed lesson — and failed with 131047 outside the 24h window.
  it('sends nothing when the parent opted out', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const db = makeSendableDbClient(makeOrgRow())
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    mockSendPaymentWithButton.mockResolvedValue({ sent: false, reason: 'opted_out' })

    await autoSendPaymentRequest('lesson-1', 'org-1')

    // No sent_at stamped — the charge must not look like it was sent.
    expect(db.updates.some((u) => 'sent_at' in u)).toBe(false)

    consoleInfoSpy.mockRestore()
  })

  it('sends through the gate when the parent has not opted out', async () => {
    const db = makeSendableDbClient(makeOrgRow())
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await autoSendPaymentRequest('lesson-1', 'org-1')

    expect(mockSendPaymentWithButton).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        phone: '+972501234567',
        accessToken: 'plain-token',
        phoneNumberId: 'pn-1',
        templateType: 'payment_request',
        // The button resolves through this charge, and the provider URL is what
        // it points at while the 24h window is open.
        chargeId: 'charge-1',
        paymentUrl: 'https://pay.example.com/1',
        body: expect.any(String),
      })
    )
    expect(db.updates.some((u) => 'sent_at' in u)).toBe(true)
  })

  it('still respects the legacy auto_send_payment_request master switch', async () => {
    const db = makeDbClient(makeOrgRow({ auto_send_payment_request: false }))
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await autoSendPaymentRequest('lesson-1', 'org-1')

    expect(db.queriedTables).toEqual(['organizations'])
    expect(mockGetPaymentProvider).not.toHaveBeenCalled()
  })
})
