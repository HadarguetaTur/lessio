import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateServiceRoleClient,
  mockDecryptToken,
  mockGetPaymentProvider,
} = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockGetPaymentProvider: vi.fn(),
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

describe('autoSendPaymentRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('still respects the legacy auto_send_payment_request master switch', async () => {
    const db = makeDbClient(makeOrgRow({ auto_send_payment_request: false }))
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await autoSendPaymentRequest('lesson-1', 'org-1')

    expect(db.queriedTables).toEqual(['organizations'])
    expect(mockGetPaymentProvider).not.toHaveBeenCalled()
  })
})
