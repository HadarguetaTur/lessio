export type SaasPlanName = 'free' | 'basic' | 'advanced' | 'custom'

export type SaasSubscriptionStatus =
  | 'trial'
  | 'active'
  | 'pending_payment'
  | 'past_due'
  | 'cancelled'
  | 'read_only'

export type SaasFeatures = {
  whatsapp_automation: boolean
  ai_assistant: boolean
  full_reports: boolean
  leads: boolean
  homework: boolean
  parent_portal: boolean
  /** Sprint 33: API keys, outbound webhooks, and the `make` payment provider. */
  integrations: boolean
}

export const DEFAULT_SAAS_FEATURES: SaasFeatures = {
  whatsapp_automation: true,
  ai_assistant: true,
  full_reports: true,
  leads: true,
  homework: true,
  parent_portal: true,
  integrations: true,
}

/** Summary shown before redirecting to hosted checkout (or mock payment page). */
export type BeginPaidCheckoutSummary = {
  planLabelHe: string
  planLabelEn: string
  amount: number
  interval: 'monthly' | 'yearly'
  isSimulated: boolean
}

export function parseSaasFeatures(raw: unknown): SaasFeatures {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SAAS_FEATURES }
  const o = raw as Record<string, unknown>
  return {
    whatsapp_automation: Boolean(o.whatsapp_automation),
    ai_assistant: Boolean(o.ai_assistant),
    full_reports: Boolean(o.full_reports),
    leads: Boolean(o.leads),
    homework: Boolean(o.homework),
    parent_portal: Boolean(o.parent_portal),
    integrations: Boolean(o.integrations),
  }
}
