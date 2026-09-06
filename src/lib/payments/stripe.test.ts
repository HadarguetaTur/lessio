import { describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { StripeProvider } from './stripe'

const SECRET = 'whsec_test_secret'
const BODY = JSON.stringify({
  id: 'evt_test',
  type: 'checkout.session.completed',
  data: { object: {
    id: 'cs_test_1', payment_status: 'paid', amount_total: 10000,
    client_reference_id: 'charge-1',
  } },
})

describe('Stripe webhook verification', () => {
  it('accepts an official Stripe signature within the timestamp tolerance', () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload: BODY, secret: SECRET })
    const provider = new StripeProvider({
      secretKey: 'sk_test_x', webhookSecret: SECRET, currency: 'ILS',
    })
    expect(provider.verifyWebhookRequest(new Headers({ 'Stripe-Signature': header }), BODY)).toBe(true)
  })

  it('rejects a forged signature and a signed replay older than five minutes', () => {
    const provider = new StripeProvider({
      secretKey: 'sk_test_x', webhookSecret: SECRET, currency: 'ILS',
    })
    expect(provider.verifyWebhookRequest(
      new Headers({ 'Stripe-Signature': 't=1,v1=forged' }), BODY
    )).toBe(false)
    const replay = Stripe.webhooks.generateTestHeaderString({
      payload: BODY, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 301,
    })
    expect(provider.verifyWebhookRequest(new Headers({ 'Stripe-Signature': replay }), BODY)).toBe(false)
  })
})
