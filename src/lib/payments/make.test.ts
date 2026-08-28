import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MakeProvider, extractUrl, parseMakeWebhookBody } from './make'

const WEBHOOK = 'https://hook.eu2.make.com/abcdef123456'

function response(body: string, init?: { status?: number }): Response {
  return new Response(body, { status: init?.status ?? 200 })
}

describe('extractUrl', () => {
  it('reads the documented shape', () => {
    expect(extractUrl('{"url":"https://pay.grow.link/abc"}')).toBe('https://pay.grow.link/abc')
  })

  it('accepts the other field names a scenario is likely to map', () => {
    expect(extractUrl('{"paymentUrl":"https://pay.example/1"}')).toBe('https://pay.example/1')
    expect(extractUrl('{"payment_url":"https://pay.example/2"}')).toBe('https://pay.example/2')
    expect(extractUrl('{"link":"https://pay.example/3"}')).toBe('https://pay.example/3')
    expect(extractUrl('{"paymentLink":"https://pay.example/4"}')).toBe('https://pay.example/4')
  })

  it('looks one level into data/body, which is how a forwarded module output arrives', () => {
    expect(extractUrl('{"data":{"url":"https://pay.example/5"}}')).toBe('https://pay.example/5')
    expect(extractUrl('{"body":{"paymentUrl":"https://pay.example/6"}}')).toBe(
      'https://pay.example/6'
    )
  })

  it('accepts a bare URL, which a single mapped field in a Webhook response sends', () => {
    expect(extractUrl('https://pay.example/7')).toBe('https://pay.example/7')
    expect(extractUrl('  https://pay.example/8  ')).toBe('https://pay.example/8')
    expect(extractUrl('"https://pay.example/9"')).toBe('https://pay.example/9')
  })

  it('rejects a body with no usable URL', () => {
    expect(extractUrl('')).toBeNull()
    expect(extractUrl('   ')).toBeNull()
    expect(extractUrl('Accepted')).toBeNull()
    expect(extractUrl('{"status":"ok"}')).toBeNull()
    expect(extractUrl('{"url":null}')).toBeNull()
    expect(extractUrl('not json at all')).toBeNull()
  })

  it('rejects a non-http scheme, so a scenario cannot hand back javascript:', () => {
    expect(extractUrl('{"url":"javascript:alert(1)"}')).toBeNull()
    expect(extractUrl('{"url":"file:///etc/passwd"}')).toBeNull()
    expect(extractUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('MakeProvider.createPaymentLink', () => {
  const provider = new MakeProvider({ webhookUrl: WEBHOOK })
  const params = {
    chargeId: 'charge-1',
    amount: 400,
    description: 'שיעורי אוגוסט',
    orgId: 'org-1',
    payer: { fullName: 'רז מזוריק', phone: '+972501234567' },
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the charge to the org webhook and returns the URL it responds with', async () => {
    const fetchMock = vi.fn(async () => response('{"url":"https://pay.grow.link/xyz"}'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await provider.createPaymentLink(params)

    expect(result.url).toBe('https://pay.grow.link/xyz')
    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(WEBHOOK)
    expect(init.method).toBe('POST')

    const sent = JSON.parse(init.body as string)
    expect(sent).toMatchObject({
      chargeId: 'charge-1',
      orgId: 'org-1',
      amount: 400,
      description: 'שיעורי אוגוסט',
      payer: { fullName: 'רז מזוריק', phone: '+972501234567' },
    })
    expect(sent.reference).toBe(result.reference)
  })

  it('mints its own reference rather than trusting the scenario', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response('{"url":"https://pay.example/1","reference":"attacker-chosen"}')
      )
    )

    const result = await provider.createPaymentLink(params)

    expect(result.reference).not.toBe('attacker-chosen')
    expect(result.reference).toMatch(/^mk_[0-9a-f-]{36}$/)
  })

  it('gives every charge a distinct reference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('{"url":"https://pay.example/1"}')))

    const a = await provider.createPaymentLink(params)
    const b = await provider.createPaymentLink(params)

    expect(a.reference).not.toBe(b.reference)
  })

  it('names the webhook when the scenario returns no URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('{"status":"accepted"}')))

    await expect(provider.createPaymentLink(params)).rejects.toThrow(/no payment URL/i)
  })

  it('surfaces an HTTP error from the scenario', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('scenario disabled', { status: 410 })))

    await expect(provider.createPaymentLink(params)).rejects.toThrow(/410/)
  })

  it('reports a timeout with the webhook URL, so the owner knows which scenario went quiet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('The operation was aborted due to timeout')
      })
    )

    await expect(provider.createPaymentLink(params)).rejects.toThrow(WEBHOOK)
  })

  it('sends null payer fields rather than omitting them', async () => {
    const fetchMock = vi.fn(async () => response('{"url":"https://pay.example/1"}'))
    vi.stubGlobal('fetch', fetchMock)

    await provider.createPaymentLink({ ...params, payer: undefined })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).payer).toEqual({ fullName: null, phone: null })
  })
})

describe('parseMakeWebhookBody', () => {
  it('reads the reference under any of its accepted names', () => {
    expect(parseMakeWebhookBody({ reference: 'mk_1', status: 'paid' })).toEqual({
      reference: 'mk_1',
      isSuccess: true,
    })
    expect(parseMakeWebhookBody({ paymentReference: 'mk_2', status: 'paid' })?.reference).toBe(
      'mk_2'
    )
    expect(parseMakeWebhookBody({ payment_reference: 'mk_3', status: 'paid' })?.reference).toBe(
      'mk_3'
    )
  })

  it('treats a reference with no status as a success', () => {
    expect(parseMakeWebhookBody({ reference: 'mk_1' })).toEqual({
      reference: 'mk_1',
      isSuccess: true,
    })
  })

  it('accepts the usual success words, whatever their case', () => {
    for (const status of ['paid', 'SUCCESS', 'Succeeded', 'completed', 'complete', 'true']) {
      expect(parseMakeWebhookBody({ reference: 'mk_1', status })?.isSuccess).toBe(true)
    }
  })

  it('does not settle a charge on a failure status', () => {
    expect(parseMakeWebhookBody({ reference: 'mk_1', status: 'failed' })?.isSuccess).toBe(false)
    expect(parseMakeWebhookBody({ reference: 'mk_1', status: 'cancelled' })?.isSuccess).toBe(false)
    expect(parseMakeWebhookBody({ reference: 'mk_1', status: 'pending' })?.isSuccess).toBe(false)
  })

  it('returns null without a reference, so an unrecognised body is ignored', () => {
    expect(parseMakeWebhookBody({ status: 'paid' })).toBeNull()
    expect(parseMakeWebhookBody({})).toBeNull()
  })
})
