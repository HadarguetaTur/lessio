/**
 * Payment provider abstraction layer — server-only.
 * Per /docs/sprint-8-scope.md § Story 2.
 *
 * PaymentProvider is the interface all adapters must implement.
 * SupportedProvider is the union of provider slugs known to the factory.
 * PaymentProviderNotConfiguredError is thrown when an org has no provider configured.
 */

/**
 * Who is being asked to pay. Optional and best-effort: every field may be
 * missing, and adapters that have no use for it ignore it entirely.
 * Grow needs it to pre-fill its hosted page, which requires a payer name and
 * an Israeli mobile number before it will take a card.
 */
export interface PaymentPayer {
  fullName?: string | null
  phone?: string | null
}

export interface PaymentProvider {
  createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
    payer?: PaymentPayer
  }): Promise<{ url: string; reference: string }>

  /**
   * Optional: called by the webhook route after a payment has been reconciled,
   * for providers that require the merchant to confirm receipt of the
   * notification (Grow's approveTransaction). It lives on the adapter rather
   * than the registry entry because the call needs the org's decrypted
   * credentials. Implementations must not throw — the charge is already paid.
   */
  acknowledgeWebhook?(body: Record<string, string>): Promise<void>
}

export type SupportedProvider = 'cardcom' | 'payplus' | 'bit' | 'paybox' | 'stripe' | 'grow'

export class PaymentProviderNotConfiguredError extends Error {
  constructor(orgId: string) {
    super(`[payments] No payment provider configured for org ${orgId}`)
    this.name = 'PaymentProviderNotConfiguredError'
  }
}
