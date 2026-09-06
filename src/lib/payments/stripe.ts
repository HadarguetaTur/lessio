/**
 * Stripe payment provider adapter.
 * Per /docs/sprint-23-scope.md § Story 3a.
 *
 * Config shape (stored encrypted in payment_config_encrypted):
 *   { secretKey: string; webhookSecret: string; currency: string }
 *
 * Creates a Stripe Checkout Session (hosted payment page).
 * Payment reference = the Checkout Session ID (cs_live_... or cs_test_...).
 * Stored in charges.payment_reference for webhook reconciliation.
 *
 * Webhooks are verified per organization with Stripe's official signature
 * verifier over the untouched request body, including timestamp tolerance.
 */

import Stripe from 'stripe'
import type { PaymentProvider } from './index'
import { getShareableBaseUrl } from '@/lib/url/appUrl'

export type StripeConfig = {
  secretKey: string
  webhookSecret: string
  currency: string
}

export class StripeProvider implements PaymentProvider {
  private stripe: Stripe
  private currency: string
  private webhookSecret: string

  constructor(config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey, { apiVersion: '2026-03-25.dahlia' })
    this.currency = config.currency.toLowerCase()
    this.webhookSecret = config.webhookSecret
  }

  verifyWebhookRequest(headers: Headers, rawBody: string): boolean {
    const signature = headers.get('stripe-signature')
    if (!signature || !this.webhookSecret) return false
    try {
      // Stripe's official verifier signs the raw body and enforces timestamp
      // tolerance. Five minutes is Stripe's documented default.
      this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret, 300)
      return true
    } catch {
      return false
    }
  }

  async createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
  }): Promise<{ url: string; reference: string }> {
    const baseUrl = getShareableBaseUrl()

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: this.currency,
            product_data: { name: params.description },
            unit_amount: Math.round(params.amount * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      // reference stored in charges.payment_reference for webhook reconciliation
      client_reference_id: params.chargeId,
      success_url: `${baseUrl}/portal/${params.orgId}/payments?payment=success`,
      cancel_url:  `${baseUrl}/portal/${params.orgId}/payments?payment=cancelled`,
      metadata: {
        charge_id: params.chargeId,
        org_id: params.orgId,
      },
    })

    if (!session.url) {
      throw new Error('[stripe] Checkout session created without a URL')
    }

    return {
      url: session.url,
      reference: session.id,
    }
  }
}
