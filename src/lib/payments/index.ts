/**
 * Payment provider abstraction layer — server-only.
 * Per /docs/sprint-8-scope.md § Story 2.
 *
 * PaymentProvider is the interface all adapters must implement.
 * SupportedProvider is the union of provider slugs known to the factory.
 * PaymentProviderNotConfiguredError is thrown when an org has no provider configured.
 */

export interface PaymentProvider {
  createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
  }): Promise<{ url: string; reference: string }>
}

export type SupportedProvider = 'cardcom' | 'payplus' | 'bit' | 'paybox' | 'stripe'

export class PaymentProviderNotConfiguredError extends Error {
  constructor(orgId: string) {
    super(`[payments] No payment provider configured for org ${orgId}`)
    this.name = 'PaymentProviderNotConfiguredError'
  }
}
