import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockSendSmartMessage = vi.fn<(params: Record<string, unknown>) => Promise<{ sent: boolean }>>(
  async () => ({ sent: true })
)

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('@/lib/crypto', () => ({
  decryptToken: (value: string) => `decrypted:${value}`,
}))

vi.mock('@/lib/whatsapp/sendSmart', () => ({
  sendSmartMessage: (params: Record<string, unknown>) => mockSendSmartMessage(params),
}))

import { formatBotMoney } from '@/lib/i18n/formatCurrency'
import { buildPaymentReceivedVars, notifyParentOfPayment } from './notifyParentOfPayment'

function mockRows(parent: Record<string, unknown> | null, org: Record<string, unknown> | null) {
  mockFrom.mockImplementation((table: string) => {
    const row = table === 'parents' ? parent : table === 'organizations' ? org : null
    const chain: Record<string, unknown> = {}
    chain['select'] = () => chain
    chain['eq'] = () => chain
    chain['maybeSingle'] = async () => ({ data: row, error: null })
    return chain
  })
}

const parent = { full_name: 'מיכל לוי', phone: '972501234567', preferred_locale: null }
const org = {
  whatsapp_phone_number_id: 'pn-1',
  whatsapp_access_token: 'enc',
  default_locale: 'he',
  currency: null,
}

beforeEach(() => {
  mockFrom.mockReset()
  mockSendSmartMessage.mockClear()
})

describe('buildPaymentReceivedVars', () => {
  it('leaves both tails empty for a full payment with no receipt', () => {
    const vars = buildPaymentReceivedVars({
      parentName: 'מיכל',
      amount: 250,
      remaining: 0,
      receiptUrls: [],
      locale: 'he',
    })
    expect(vars).toEqual({
      parent_name: 'מיכל',
      amount: formatBotMoney(250, 'he'),
      balance_line: '',
      receipt_line: '',
    })
  })

  it('appends the remaining balance after a partial payment', () => {
    const vars = buildPaymentReceivedVars({
      parentName: 'Michelle',
      amount: 100,
      remaining: 150,
      receiptUrls: [],
      locale: 'en',
    })
    expect(vars.balance_line).toBe('\nRemaining balance: ₪150.00')
    expect(vars.receipt_line).toBe('')
  })

  it('adds one receipt line per document, each introduced by a full sentence', () => {
    const vars = buildPaymentReceivedVars({
      parentName: 'Michelle',
      amount: 500,
      remaining: 0,
      receiptUrls: ['https://r/1', 'https://r/2'],
      locale: 'en',
    })
    expect(vars.receipt_line).toBe(
      '\nYour receipt is available here.\nhttps://r/1\nYour receipt is available here.\nhttps://r/2'
    )
  })

  it('formats in the org currency', () => {
    const vars = buildPaymentReceivedVars({
      parentName: 'Michelle',
      amount: 40,
      remaining: 0,
      receiptUrls: [],
      locale: 'en',
      currency: 'USD',
    })
    expect(vars.amount).toBe(formatBotMoney(40, 'en', 'USD'))
    expect(vars.amount).not.toContain('₪')
  })
})

describe('notifyParentOfPayment', () => {
  it('sends the payment_received template through sendSmartMessage in the parent language', async () => {
    mockRows({ ...parent, preferred_locale: 'en' }, org)

    await notifyParentOfPayment({
      orgId: 'org-1',
      parentId: 'parent-1',
      chargeIds: ['c-1'],
      amount: 250,
      remaining: 0,
      receiptUrls: [],
    })

    expect(mockSendSmartMessage).toHaveBeenCalledTimes(1)
    const call = mockSendSmartMessage.mock.calls[0]![0]
    expect(call).toMatchObject({
      orgId: 'org-1',
      phone: '972501234567',
      accessToken: 'decrypted:enc',
      phoneNumberId: 'pn-1',
      templateType: 'payment_received',
      locale: 'en',
    })
    expect((call.vars as Record<string, string>).parent_name).toBe('מיכל לוי')
  })

  it('sends nothing when the parent has no phone', async () => {
    mockRows({ ...parent, phone: null }, org)
    await notifyParentOfPayment({
      orgId: 'org-1', parentId: 'parent-1', chargeIds: ['c-1'], amount: 1, remaining: 0, receiptUrls: [],
    })
    expect(mockSendSmartMessage).not.toHaveBeenCalled()
  })

  it('sends nothing when the org has no WhatsApp connection', async () => {
    mockRows(parent, { ...org, whatsapp_access_token: null })
    await notifyParentOfPayment({
      orgId: 'org-1', parentId: 'parent-1', chargeIds: ['c-1'], amount: 1, remaining: 0, receiptUrls: [],
    })
    expect(mockSendSmartMessage).not.toHaveBeenCalled()
  })

  it('never throws — a WhatsApp failure must not surface to the payment', async () => {
    mockRows(parent, org)
    mockSendSmartMessage.mockRejectedValueOnce(new Error('Meta 500'))
    await expect(
      notifyParentOfPayment({
        orgId: 'org-1', parentId: 'parent-1', chargeIds: ['c-1'], amount: 1, remaining: 0, receiptUrls: [],
      })
    ).resolves.toBeUndefined()
  })
})
