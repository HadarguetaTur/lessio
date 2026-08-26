import { describe, it, expect } from 'vitest'
import { computeOrgReadiness, type OrgReadinessRow } from './readiness'

const EMPTY: OrgReadinessRow = {
  whatsapp_phone_number_id: null,
  ai_provider: null,
  ai_config_encrypted: null,
  payment_config_encrypted: null,
}

const NO_PLATFORM_KEY = { platformOpenAiKey: false }
const WITH_PLATFORM_KEY = { platformOpenAiKey: true }

describe('computeOrgReadiness', () => {
  it('treats a missing org as configured for nothing', () => {
    expect(computeOrgReadiness(null, WITH_PLATFORM_KEY)).toEqual({
      hasWhatsApp: false,
      hasAi: false,
      hasPayment: false,
      isReady: false,
    })
  })

  it('is the day-one state for a tenant that just signed up', () => {
    expect(computeOrgReadiness(EMPTY, NO_PLATFORM_KEY)).toEqual({
      hasWhatsApp: false,
      hasAi: false,
      hasPayment: false,
      isReady: false,
    })
  })

  it('reads a connected WhatsApp number on its own', () => {
    const r = computeOrgReadiness(
      { ...EMPTY, whatsapp_phone_number_id: '1234567890' },
      NO_PLATFORM_KEY
    )
    expect(r.hasWhatsApp).toBe(true)
    expect(r.hasAi).toBe(false)
    expect(r.hasPayment).toBe(false)
    expect(r.isReady).toBe(false)
  })

  it('reads a payment provider on its own', () => {
    const r = computeOrgReadiness(
      { ...EMPTY, payment_config_encrypted: 'cipher' },
      NO_PLATFORM_KEY
    )
    expect(r.hasPayment).toBe(true)
    expect(r.isReady).toBe(false)
  })

  it("counts the org's own AI key regardless of provider", () => {
    for (const ai_provider of ['openai', 'anthropic', 'gemini']) {
      const r = computeOrgReadiness(
        { ...EMPTY, ai_provider, ai_config_encrypted: 'cipher' },
        NO_PLATFORM_KEY
      )
      expect(r.hasAi, ai_provider).toBe(true)
    }
  })

  it('falls back to the platform OpenAI key when the provider is openai', () => {
    expect(computeOrgReadiness({ ...EMPTY, ai_provider: 'openai' }, WITH_PLATFORM_KEY).hasAi).toBe(true)
    // A null provider means openai — the same default the factory applies.
    expect(computeOrgReadiness(EMPTY, WITH_PLATFORM_KEY).hasAi).toBe(true)
  })

  it('does not lend the platform key to a non-openai provider', () => {
    const r = computeOrgReadiness({ ...EMPTY, ai_provider: 'anthropic' }, WITH_PLATFORM_KEY)
    expect(r.hasAi).toBe(false)
  })

  it('is ready only once all three are present', () => {
    const full: OrgReadinessRow = {
      whatsapp_phone_number_id: '1234567890',
      ai_provider: 'openai',
      ai_config_encrypted: 'cipher',
      payment_config_encrypted: 'cipher',
    }
    expect(computeOrgReadiness(full, NO_PLATFORM_KEY).isReady).toBe(true)

    for (const missing of [
      'whatsapp_phone_number_id',
      'ai_config_encrypted',
      'payment_config_encrypted',
    ] as const) {
      const partial = { ...full, [missing]: null }
      expect(computeOrgReadiness(partial, NO_PLATFORM_KEY).isReady, missing).toBe(false)
    }
  })
})
