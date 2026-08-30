/**
 * Fixed-payment-link adapter.
 *
 * For orgs with no payment processor at all: they hold a single static link —
 * a personal Bit page, a PayBox group link, a hosted payment page — and want
 * that link sent to parents in every payment request. Lessio never talks to a
 * remote here; "creating" a payment link is returning the configured URL.
 *
 * Reference mapping:
 *   payment_reference → ml_<uuid>, minted here (same reasoning as make.ts:
 *   the pipeline stamps a reference on every charge, and the consolidated
 *   flow groups charges by it, so it must exist and be unique per send)
 *   payment_link      → the configured URL, identical for every charge
 *
 * Settlement: there is none. Nothing on the other side of a static link can
 * call back, so charges close only through the existing manual paths — mark
 * as paid / record a payment on the charges screen, or
 * POST /api/v1/charges/{id}/payments with an API key. The settings screen's
 * setupHint says as much to the owner.
 */

import { randomUUID } from 'crypto'
import type { PaymentProvider } from './index'

export interface ManualLinkConfig {
  paymentUrl: string
}

export class ManualLinkProvider implements PaymentProvider {
  constructor(private config: ManualLinkConfig) {}

  async createPaymentLink(_params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
  }): Promise<{ url: string; reference: string }> {
    return { url: this.config.paymentUrl, reference: `ml_${randomUUID()}` }
  }
}
