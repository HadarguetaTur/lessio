import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient, mockNotify } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockNotify: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('./notifyParentOfReceipt', () => ({ notifyParentOfReceipt: mockNotify }))

import { recordExternalReceipt } from './recordExternalReceipt'

/**
 * @param receiptIssuedAt  non-null means a document was already recorded
 * @param updatedRows      rows the guarded UPDATE matched (empty = lost a race)
 */
function makeDb(
  receiptIssuedAt: string | null,
  updatedRows: { id: string }[] = [{ id: 'charge-1' }],
  receiptMode: string | null = 'payment_provider'
) {
  const charge = {
    id: 'charge-1',
    amount: 250,
    receipt_issued_at: receiptIssuedAt,
    parents: { full_name: 'דנה כהן', phone: '+972501234567', preferred_locale: 'he' },
    organizations: {
      whatsapp_phone_number_id: 'pn-1',
      whatsapp_access_token: 'enc',
      default_locale: 'he',
      receipt_mode: receiptMode,
    },
  }

  const updateSelect = vi.fn().mockResolvedValue({ data: updatedRows, error: null })
  const isFn = vi.fn(() => ({ select: updateSelect }))
  const update = vi.fn(() => ({ eq: vi.fn(() => ({ is: isFn })) }))
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: charge, error: null }) })),
    })),
  }))

  return { client: { from: vi.fn(() => ({ select, update })) }, spies: { update, isFn } }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockNotify.mockResolvedValue(undefined)
})

describe('recordExternalReceipt', () => {
  it('stores the document on the charge and sends it to the parent', async () => {
    const db = makeDb(null)
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await recordExternalReceipt({
      chargeId: 'charge-1',
      orgId: 'org-1',
      receiptUrl: 'https://secure.meshulam.co.il/invoice/20',
      documentNumber: '20',
    })

    expect(result).toBe(true)
    expect(db.spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ receipt_url: 'https://secure.meshulam.co.il/invoice/20' })
    )
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeId: 'charge-1',
        amount: 250,
        receiptUrl: 'https://secure.meshulam.co.il/invoice/20',
        parentPhone: '+972501234567',
      })
    )
  })

  // Grow retries a webhook up to six times; the parent must not get six links.
  it('does nothing when a document was already recorded', async () => {
    const db = makeDb('2026-08-26T10:00:00.000Z')
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await recordExternalReceipt({
      chargeId: 'charge-1',
      orgId: 'org-1',
      receiptUrl: 'https://doc',
    })

    expect(result).toBe(false)
    expect(db.spies.update).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('sends nothing when the guarded update loses a concurrent race', async () => {
    const db = makeDb(null, [])
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await recordExternalReceipt({
      chargeId: 'charge-1',
      orgId: 'org-1',
      receiptUrl: 'https://doc',
    })

    expect(result).toBe(false)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  // An org that said invoicing happens outside Lessio has opted out of Lessio
  // messaging its parents about invoices. The document is still worth keeping
  // on the charge — it just must not trigger an outbound message.
  it("records but stays silent when the org invoices outside Lessio", async () => {
    const db = makeDb(null, [{ id: 'charge-1' }], 'none')
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const result = await recordExternalReceipt({
      chargeId: 'charge-1',
      orgId: 'org-1',
      receiptUrl: 'https://doc',
    })

    expect(result).toBe(true)
    expect(db.spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ receipt_url: 'https://doc' })
    )
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('sends when the org has not answered the question yet', async () => {
    const db = makeDb(null, [{ id: 'charge-1' }], null)
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await recordExternalReceipt({ chargeId: 'charge-1', orgId: 'org-1', receiptUrl: 'https://doc' })

    expect(mockNotify).toHaveBeenCalledOnce()
  })
})
