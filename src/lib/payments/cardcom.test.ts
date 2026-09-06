import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardcomProvider } from './cardcom'

const provider = new CardcomProvider({ terminal: '1000', apiName: 'test9611', apiPassword: 'x' })
const params = { reference: 'lpc-1', expectedAmount: 150, chargeIds: ['charge-1'] }

afterEach(() => vi.unstubAllGlobals())

describe('Cardcom server-side confirmation', () => {
  it('creates a v11 ChargeOnly page with a server webhook', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      ResponseCode: 0, LowProfileId: 'lpc-1', Url: 'https://cardcom.test/pay',
    })))
    const result = await provider.createPaymentLink({
      chargeId: 'charge-1', amount: 150, description: 'Lesson', orgId: 'org-1',
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      Operation: 'ChargeOnly', ReturnValue: 'charge-1', Amount: 150, ISOCoinId: 1,
    })
    expect(body.WebHookUrl).toMatch(/\/api\/payments\/cardcom$/)
    expect(result).toEqual({ url: 'https://cardcom.test/pay', reference: 'lpc-1' })
  })

  it('accepts only a matching, completed, approved transaction and amount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      ResponseCode: 0, TerminalNumber: 1000, LowProfileId: 'lpc-1',
      ReturnValue: 'charge-1', Operation: 'ChargeOnly',
      TranzactionInfo: {
        ResponseCode: 0, TerminalNumber: 1000, Amount: 150, CoinId: 1, IsRefund: false,
      },
    })))
    expect(await provider.confirmTransaction(params)).toBe(true)
  })

  it('rejects a nonexistent or mismatched transaction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ResponseCode: 404 })))
    expect(await provider.confirmTransaction(params)).toBe(false)
  })
})
