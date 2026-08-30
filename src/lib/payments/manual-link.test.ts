import { describe, it, expect } from 'vitest'
import { ManualLinkProvider } from './manual-link'
import { getRegistryEntry } from './registry'
import { PROVIDERS_UI } from './registry-ui'

const PAYMENT_URL = 'https://www.bitpay.co.il/app/me/ABCD1234'

describe('ManualLinkProvider.createPaymentLink', () => {
  const provider = new ManualLinkProvider({ paymentUrl: PAYMENT_URL })
  const params = {
    chargeId: 'charge-1',
    amount: 400,
    description: 'שיעורי אוגוסט',
    orgId: 'org-1',
  }

  it('returns the configured URL untouched', async () => {
    const result = await provider.createPaymentLink(params)
    expect(result.url).toBe(PAYMENT_URL)
  })

  it('mints an ml_ reference — the pipeline stamps it on the charge', async () => {
    const result = await provider.createPaymentLink(params)
    expect(result.reference).toMatch(/^ml_[0-9a-f-]{36}$/)
  })

  it('gives every charge a distinct reference even though the URL is shared', async () => {
    const a = await provider.createPaymentLink(params)
    const b = await provider.createPaymentLink(params)
    expect(a.reference).not.toBe(b.reference)
    expect(a.url).toBe(b.url)
  })
})

describe('manual_link entry', () => {
  const entry = getRegistryEntry('manual_link')!

  it('is registered', () => {
    expect(entry).toBeDefined()
  })

  it('accepts a payment URL', () => {
    const result = entry.validateConfig({ paymentUrl: PAYMENT_URL })
    expect(result).toEqual({ success: true, config: { paymentUrl: PAYMENT_URL } })
  })

  it('rejects a value that is not a URL, with a catalog key rather than prose', () => {
    const result = entry.validateConfig({ paymentUrl: 'not-a-url' })
    expect(result.success).toBe(false)
    expect(result.success === false && result.errorKey).toBe('validation.paymentUrlInvalid')
  })

  it('rejects a missing payment URL', () => {
    expect(entry.validateConfig({}).success).toBe(false)
    expect(entry.validateConfig({ paymentUrl: '' }).success).toBe(false)
  })

  it('recognises no webhook body — nothing behind a static link can call back', () => {
    expect(entry.parseWebhookBody({ reference: 'ml_1', status: 'paid' })).toBeNull()
    expect(entry.parseWebhookBody({})).toBeNull()
  })

  it('is appended in the UI list, so it does not become the default selection', () => {
    expect(PROVIDERS_UI[0]?.id).not.toBe('manual_link')
  })
})
