import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  GrowProvider,
  parseGrowWebhookBody,
  parseGrowInvoiceWebhookBody,
  growWebhookTransactionIds,
} from './grow'

const CONFIG = { userId: 'u-123', pageCode: 'pc-abc', apiKey: 'key-xyz' }

const LINK_PARAMS = {
  chargeId: 'charge-1',
  amount: 350,
  description: 'שיעורי פסנתר — אוגוסט',
  orgId: 'org-1',
}

/** Reads the FormData body of the single fetch call as a plain object. */
function sentForm(): Record<string, string> {
  const [, init] = vi.mocked(fetch).mock.calls[0]!
  return Object.fromEntries(init!.body as FormData) as Record<string, string>
}

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.getlessio.com')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('GrowProvider.createPaymentLink', () => {
  it('returns the hosted page URL and uses processToken as the reference', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        status: 1,
        data: { url: 'https://secure.meshulam.co.il/p/abc', processId: 332002, processToken: 'tok-long-random' },
      })
    )

    const result = await new GrowProvider(CONFIG).createPaymentLink(LINK_PARAMS)

    expect(result).toEqual({
      url: 'https://secure.meshulam.co.il/p/abc',
      reference: 'tok-long-random',
    })
  })

  it('posts form-data with credentials, amount in shekels, and our callback URLs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: 1, data: { url: 'https://pay', processToken: 'tok' } })
    )

    await new GrowProvider(CONFIG).createPaymentLink(LINK_PARAMS)

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('https://secure.meshulam.co.il/api/light/server/1.0/createPaymentProcess')
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>)['x-api-key']).toBe('key-xyz')

    const form = sentForm()
    expect(form.userId).toBe('u-123')
    expect(form.pageCode).toBe('pc-abc')
    expect(form.sum).toBe('350.00')
    expect(form.chargeType).toBe('1')
    expect(form.notifyUrl).toBe('https://www.getlessio.com/api/payments/grow')
    expect(form.invoiceNotifyUrl).toBe('https://www.getlessio.com/api/payments/grow/invoice')
    expect(form.successUrl).toBe('https://www.getlessio.com/portal/org-1/payments?payment=success')
    expect(form.cancelUrl).toBe('https://www.getlessio.com/portal/org-1/payments?payment=cancelled')
    expect(form.cField1).toBe('charge-1')
    expect(form.cField2).toBe('org-1')
    // Payment methods are whatever the org enabled on its Grow page.
    expect(form.transactionTypes).toBeUndefined()
  })

  it('keeps Hebrew in the description but strips characters Grow rejects', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: 1, data: { url: 'https://pay', processToken: 'tok' } })
    )

    await new GrowProvider(CONFIG).createPaymentLink({
      ...LINK_PARAMS,
      description: 'שיעור #4 <גיטרה> 50% הנחה',
    })

    expect(sentForm().description).toBe('שיעור 4 גיטרה 50 הנחה')
  })

  it('pre-fills the payer, converting the phone to the local Israeli form', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: 1, data: { url: 'https://pay', processToken: 'tok' } })
    )

    await new GrowProvider(CONFIG).createPaymentLink({
      ...LINK_PARAMS,
      payer: { fullName: 'דנה כהן', phone: '+972501234567' },
    })

    const form = sentForm()
    expect(form['pageField[fullName]']).toBe('דנה כהן')
    expect(form['pageField[phone]']).toBe('0501234567')
  })

  it('omits a one-word name — Grow demands at least two', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: 1, data: { url: 'https://pay', processToken: 'tok' } })
    )

    await new GrowProvider(CONFIG).createPaymentLink({
      ...LINK_PARAMS,
      payer: { fullName: 'דנה', phone: '+972501234567' },
    })

    const form = sentForm()
    expect(form['pageField[fullName]']).toBeUndefined()
    expect(form['pageField[phone]']).toBe('0501234567')
  })

  it('omits a phone Grow would reject rather than failing the request', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: 1, data: { url: 'https://pay', processToken: 'tok' } })
    )

    await new GrowProvider(CONFIG).createPaymentLink({
      ...LINK_PARAMS,
      payer: { fullName: 'דנה כהן', phone: '+1 415 555 0000' },
    })

    const form = sentForm()
    expect(form['pageField[phone]']).toBeUndefined()
    expect(form['pageField[fullName]']).toBe('דנה כהן')
  })

  it('sends no page fields when the payer is unknown', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: 1, data: { url: 'https://pay', processToken: 'tok' } })
    )

    await new GrowProvider(CONFIG).createPaymentLink(LINK_PARAMS)

    const form = sentForm()
    expect(form['pageField[fullName]']).toBeUndefined()
    expect(form['pageField[phone]']).toBeUndefined()
  })

  it('targets the sandbox when GROW_API_BASE_URL is set', async () => {
    vi.stubEnv('GROW_API_BASE_URL', 'https://sandbox.meshulam.co.il/api/light/server/1.0/')
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: 1, data: { url: 'https://pay', processToken: 'tok' } })
    )

    await new GrowProvider(CONFIG).createPaymentLink(LINK_PARAMS)

    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess'
    )
  })

  it('throws on an HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ err: 'nope' }, false, 401))

    await expect(new GrowProvider(CONFIG).createPaymentLink(LINK_PARAMS)).rejects.toThrow(
      /\[grow\] API HTTP error 401/
    )
  })

  it('throws with the provider message when Grow reports status 0', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: 0, err: { message: 'Invalid pageCode', code: 103 } })
    )

    await expect(new GrowProvider(CONFIG).createPaymentLink(LINK_PARAMS)).rejects.toThrow(
      /\[grow\] API error: Invalid pageCode/
    )
  })

  it('throws when the response carries no processToken', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 1, data: { url: 'https://pay' } }))

    await expect(new GrowProvider(CONFIG).createPaymentLink(LINK_PARAMS)).rejects.toThrow(
      /missing url or processToken/
    )
  })
})

describe('GrowProvider.acknowledgeWebhook', () => {
  it('calls approveTransaction with the process identifiers from the webhook', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 1 }))

    await new GrowProvider(CONFIG).acknowledgeWebhook({
      processId: '332002',
      processToken: 'tok-long-random',
    })

    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
      'https://secure.meshulam.co.il/api/light/server/1.0/approveTransaction'
    )
    const form = sentForm()
    expect(form.processId).toBe('332002')
    expect(form.processToken).toBe('tok-long-random')
    expect(form.userId).toBe('u-123')
  })

  it('does not call Grow when the webhook has no process identifiers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await new GrowProvider(CONFIG).acknowledgeWebhook({ statusCode: '2' })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('swallows an approveTransaction failure — the charge is already paid', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ err: 'boom' }, false, 500))

    await expect(
      new GrowProvider(CONFIG).acknowledgeWebhook({ processId: '1', processToken: 't' })
    ).resolves.toBeUndefined()
  })
})

describe('parseGrowWebhookBody', () => {
  it('reconciles on processToken and treats statusCode 2 as paid', () => {
    expect(parseGrowWebhookBody({ processToken: 'tok', statusCode: '2', status: 'שולם' })).toEqual({
      reference: 'tok',
      isSuccess: true,
    })
  })

  it('accepts the Hebrew status text when statusCode is absent', () => {
    expect(parseGrowWebhookBody({ processToken: 'tok', status: 'שולם' })).toEqual({
      reference: 'tok',
      isSuccess: true,
    })
  })

  it('reports a non-paid status as unsuccessful', () => {
    expect(parseGrowWebhookBody({ processToken: 'tok', statusCode: '4', status: 'נכשל' })).toEqual({
      reference: 'tok',
      isSuccess: false,
    })
  })

  it('returns null without a processToken', () => {
    expect(parseGrowWebhookBody({ statusCode: '2' })).toBeNull()
  })
})

describe('growWebhookTransactionIds', () => {
  // Grow's invoice webhook identifies the transaction by `transactionCode`, and
  // its docs never say which of these that equals — so all of them are kept.
  it('collects every identifier the payment webhook carried', () => {
    expect(
      growWebhookTransactionIds({
        transactionId: '79755',
        transactionToken: 'f3f9598b42cb1199',
        asmachta: '7304783',
        processToken: 'tok',
      })
    ).toEqual(['79755', 'f3f9598b42cb1199', '7304783'])
  })

  it('drops the ones a given payload happens not to carry', () => {
    expect(growWebhookTransactionIds({ asmachta: '7304783' })).toEqual(['7304783'])
    expect(growWebhookTransactionIds({})).toEqual([])
  })
})

describe('parseGrowInvoiceWebhookBody', () => {
  it('reads the transaction code, URL and document number', () => {
    expect(
      parseGrowInvoiceWebhookBody({
        transactionCode: 'ABCD1234',
        invoiceNumber: '20',
        invoiceUrl: 'https://secure.meshulam.co.il/invoice/20',
      })
    ).toEqual({
      transactionCode: 'ABCD1234',
      invoiceUrl: 'https://secure.meshulam.co.il/invoice/20',
      invoiceNumber: '20',
    })
  })

  it('tolerates a missing document number', () => {
    expect(
      parseGrowInvoiceWebhookBody({ transactionCode: 'ABCD1234', invoiceUrl: 'https://doc' })
    ).toEqual({ transactionCode: 'ABCD1234', invoiceUrl: 'https://doc', invoiceNumber: null })
  })

  it('returns null without something to match on or something to record', () => {
    expect(parseGrowInvoiceWebhookBody({ invoiceUrl: 'https://doc' })).toBeNull()
    expect(parseGrowInvoiceWebhookBody({ transactionCode: 'ABCD1234' })).toBeNull()
  })
})
