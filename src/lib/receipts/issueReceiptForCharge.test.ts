import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient, mockGetReceiptProvider, mockIssueReceipt } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockGetReceiptProvider: vi.fn(),
  mockIssueReceipt: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('./factory', () => ({ getReceiptProvider: mockGetReceiptProvider }))
vi.mock('@/lib/crypto', () => ({ decryptToken: vi.fn(() => 'token') }))
vi.mock('@/lib/whatsapp', () => ({ sendTextMessage: vi.fn() }))
vi.mock('@/lib/whatsapp/consent', () => ({
  prepareBusinessSend: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/whatsapp/templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue('body'),
}))
vi.mock('@/lib/i18n/serverTranslator', () => ({
  getT: vi.fn().mockResolvedValue((key: string) => key),
}))
vi.mock('@/lib/charges/renderNote', () => ({ renderChargeNote: vi.fn(() => null) }))

import { issueReceiptForCharge } from './issueReceiptForCharge'

/** A paid, not-yet-receipted charge whose org carries the given receipt_mode. */
function makeDb(
  receiptMode: string | null,
  options: { amount?: number; documentType?: string; vatRate?: number } = {}
) {
  let claimed = false
  const updates: Record<string, unknown>[] = []
  const charge = {
    id: 'charge-1',
    amount: options.amount ?? 100,
    charge_type: 'lesson',
    billing_month: null,
    notes: null,
    status: 'paid',
    receipt_issued_at: null,
    parent_id: 'parent-1',
    parents: { full_name: 'דנה כהן', phone: null, tax_id: null, preferred_locale: 'he' },
    organizations: {
      name: 'Studio',
      timezone: 'Asia/Jerusalem',
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      receipt_document_type: options.documentType ?? 'receipt',
      receipt_mode: receiptMode,
      default_vat_rate: options.vatRate ?? 0,
      default_locale: 'he',
    },
  }

  const update = vi.fn((values: Record<string, unknown>) => {
    updates.push(values)
    const isClaim = Object.keys(values).length === 1 && values.receipt_issued_at !== null
    const chain: Record<string, unknown> = {}
    chain.eq = vi.fn(() => chain)
    chain.is = vi.fn(() => chain)
    chain.select = vi.fn(() => {
      const rows = (async () => {
        if (isClaim && claimed) return { data: [], error: null }
        if (isClaim) claimed = true
        return { data: [{ id: 'charge-1', receipt_attempts: 0 }], error: null }
      })()
      // Awaitable as a list, and .maybeSingle() for the callers that want one row.
      return Object.assign(rows, {
        maybeSingle: async () => {
          const result = await rows
          return { ...result, data: result.data?.[0] ?? null }
        },
      })
    })
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null })
    return chain
  })

  const select = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: charge, error: null }) })),
    })),
  }))

  return Object.assign({ from: vi.fn(() => ({ select, update })) }, { updates })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetReceiptProvider.mockResolvedValue({ issueReceipt: mockIssueReceipt })
  mockIssueReceipt.mockResolvedValue({
    receiptUrl: 'https://doc',
    receiptId: 'doc-1',
    documentType: 'receipt',
  })
})

describe('issueReceiptForCharge — who issues the document', () => {
  // The safety net behind the settings screen: even if credentials survived a
  // mode change, a payment that already produced an invoice elsewhere must not
  // get a second one.
  it('issues nothing when the payment provider issues the invoices', async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeDb('payment_provider'))

    const result = await issueReceiptForCharge('charge-1', 'org-1')

    expect(result).toBeNull()
    expect(mockGetReceiptProvider).not.toHaveBeenCalled()
    expect(mockIssueReceipt).not.toHaveBeenCalled()
  })

  it('issues nothing when the org invoices outside Lessio', async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeDb('none'))

    const result = await issueReceiptForCharge('charge-1', 'org-1')

    expect(result).toBeNull()
    expect(mockIssueReceipt).not.toHaveBeenCalled()
  })

  it("issues through the configured service when the mode is 'external'", async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeDb('external'))

    const result = await issueReceiptForCharge('charge-1', 'org-1')

    expect(result).toBe('https://doc')
    expect(mockIssueReceipt).toHaveBeenCalledOnce()
  })

  // Orgs that predate the question have receipt_mode NULL. They already had a
  // provider connected, so their receipts must keep working untouched.
  it('keeps issuing for an org that has not answered the question yet', async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeDb(null))

    const result = await issueReceiptForCharge('charge-1', 'org-1')

    expect(result).toBe('https://doc')
    expect(mockIssueReceipt).toHaveBeenCalledOnce()
  })

  it('claims before the provider call so concurrent callbacks issue only once', async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeDb('external'))

    const [first, second] = await Promise.all([
      issueReceiptForCharge('charge-1', 'org-1'),
      issueReceiptForCharge('charge-1', 'org-1'),
    ])

    expect([first, second].filter(Boolean)).toEqual(['https://doc'])
    expect(mockIssueReceipt).toHaveBeenCalledOnce()
  })
})

describe('issueReceiptForCharge — VAT', () => {
  it('extracts the VAT contained in the price rather than adding it on top', async () => {
    // ₪1,000 collected at 18%: the document is base 847.46 + VAT 152.54, total
    // 1,000. Multiplying by the rate produced a ₪1,180 tax invoice for ₪1,000
    // of money.
    mockCreateServiceRoleClient.mockReturnValue(
      makeDb('external', { amount: 1000, documentType: 'tax_invoice', vatRate: 18 })
    )
    mockIssueReceipt.mockResolvedValue({
      receiptUrl: 'https://doc',
      receiptId: 'doc-1',
      documentType: 'tax_invoice',
    })

    await issueReceiptForCharge('charge-1', 'org-1')

    const params = mockIssueReceipt.mock.calls[0]![0]
    expect(params.amount).toBe(1000)
    expect(params.vatAmount).toBe(152.54)
    expect(Math.round((params.amount - params.vatAmount) * 100) / 100).toBe(847.46)
  })

  it('sends no VAT figure on a plain receipt', async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeDb('external', { amount: 1000, vatRate: 18 }))

    await issueReceiptForCharge('charge-1', 'org-1')

    expect(mockIssueReceipt.mock.calls[0]![0].vatAmount).toBeUndefined()
  })
})

describe('issueReceiptForCharge — a document that could not be issued', () => {
  it('records the failure on the charge instead of only logging it', async () => {
    const db = makeDb('external')
    mockCreateServiceRoleClient.mockReturnValue(db)
    mockIssueReceipt.mockRejectedValue(new Error('green-invoice: 402 subscription expired'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(issueReceiptForCharge('charge-1', 'org-1')).rejects.toThrow(/402/)
    errors.mockRestore()

    const released = db.updates.find((u) => 'receipt_error' in u)
    expect(released).toMatchObject({
      receipt_issued_at: null,
      receipt_error: expect.stringContaining('402'),
      receipt_failed_at: expect.any(String),
    })
    // And the claim is released, so a retry is possible.
    expect(db.updates.some((u) => u.receipt_attempts === 1)).toBe(true)
  })
})
