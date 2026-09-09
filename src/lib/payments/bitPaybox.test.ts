import { afterEach, describe, expect, it, vi } from 'vitest'
import { BitProvider } from './bit'
import { PayBoxProvider } from './paybox'
import { getRegistryEntry } from './registry'

/**
 * Neither adapter has `confirmTransaction`, so `/api/payments/[provider]`'s
 * `if (!requestVerified && !providerConfirmed) return { ok:false }` makes the
 * signed webhook the ONLY settlement path. Without the HMAC secret in
 * production, every payment is rejected and the parent's money disappears into
 * a log line — so the link must not be minted at all.
 */
describe('Bit / PayBox settle only through a signed webhook', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('neither adapter exposes confirmTransaction', () => {
    const bit = new BitProvider({ apiKey: 'k', secret: 's', merchantId: 'm' })
    const paybox = new PayBoxProvider({ apiKey: 'k', secret: 's', merchantId: 'm' })
    expect((bit as { confirmTransaction?: unknown }).confirmTransaction).toBeUndefined()
    expect((paybox as { confirmTransaction?: unknown }).confirmTransaction).toBeUndefined()
  })

  it.each([
    ['bit', () => new BitProvider({ apiKey: 'k', secret: 's', merchantId: 'm' }), 'BIT_WEBHOOK_HMAC_SECRET'],
    ['paybox', () => new PayBoxProvider({ apiKey: 'k', secret: 's', merchantId: 'm' }), 'PAYBOX_WEBHOOK_HMAC_SECRET'],
  ])('%s refuses to mint a link in production with no HMAC secret', async (_name, make, envVar) => {
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env[envVar]
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      make().createPaymentLink({ chargeId: 'charge-1', amount: 100, description: 'd', orgId: 'org-1' })
    ).rejects.toThrow(new RegExp(envVar))

    // Nothing was even asked of the provider.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /**
   * The stored reference is the PROVIDER's id, not our chargeId — the
   * `reference: chargeId` field in the request body is what we send them. The
   * webhook parser must read that same id back, or nothing ever settles (the
   * shape of the Grow bug). Verified here against our own two halves; what
   * remains UNVERIFIABLE without a live account is whether the provider really
   * echoes its id under one of these names.
   */
  it.each([
    ['bit', { paymentId: 'prov-abc', paymentUrl: 'https://pay/x' }, { transactionId: 'prov-abc', status: 'completed' }],
    ['paybox', { transactionId: 'prov-xyz', paymentUrl: 'https://pay/y' }, { transactionId: 'prov-xyz', status: 'paid' }],
  ])('%s: the reference it stores is the one its webhook parser reads back', async (
    id,
    createResponse,
    callbackBody
  ) => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => createResponse })
    )

    const adapter =
      id === 'bit'
        ? new BitProvider({ apiKey: 'k', secret: 's', merchantId: 'm' })
        : new PayBoxProvider({ apiKey: 'k', secret: 's', merchantId: 'm' })

    const minted = await adapter.createPaymentLink({
      chargeId: 'charge-1',
      amount: 100,
      description: 'd',
      orgId: 'org-1',
    })

    expect(minted.reference).not.toBe('charge-1')

    const parsed = getRegistryEntry(id)!.parseWebhookBody(callbackBody as Record<string, string>)
    expect(parsed).not.toBeNull()
    expect(parsed!.reference).toBe(minted.reference)
    expect(parsed!.isSuccess).toBe(true)
  })
})
