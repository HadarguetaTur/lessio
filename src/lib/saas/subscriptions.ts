import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSaasPlanById, getSaasPlanByName } from './plans'
import type { SaasPlanName, SaasSubscriptionStatus } from './types'
import { parseSaasFeatures, type SaasFeatures } from './types'

const TRIAL_DAYS = 30

export type OrgSubscriptionState = {
  subscriptionId: string
  planId: string
  planName: SaasPlanName
  status: SaasSubscriptionStatus
  billingInterval: 'monthly' | 'yearly'
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  cardLastFour: string | null
  features: SaasFeatures
}

export async function getOpenCustomPlanInquiry(orgId: string): Promise<{ id: string } | null> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('saas_plan_inquiries')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .maybeSingle()

  return data?.id ? { id: data.id } : null
}

export async function getOrgSubscriptionState(orgId: string): Promise<OrgSubscriptionState | null> {
  const db = createServiceRoleClient()
  const { data: sub } = await db
    .from('organization_subscriptions')
    .select(
      'id, plan_id, status, billing_interval, trial_ends_at, current_period_end, cancel_at_period_end, card_last_four'
    )
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!sub) return null

  const plan = await getSaasPlanById(sub.plan_id)
  if (!plan) return null

  return {
    subscriptionId: sub.id,
    planId: sub.plan_id,
    planName: plan.name,
    status: sub.status as SaasSubscriptionStatus,
    billingInterval: sub.billing_interval as 'monthly' | 'yearly',
    trialEndsAt: sub.trial_ends_at,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cardLastFour: sub.card_last_four,
    features: plan.features,
  }
}

/**
 * Effective entitlements for UI (sidebar).
 * - No subscription row: grandfathered orgs → full access.
 * - Active trial: full app (same as Advanced).
 * - Read-only (expired free): full navigation so owners can view all areas; mutations blocked separately.
 */
export async function getEffectiveSaasFeatures(orgId: string): Promise<SaasFeatures> {
  const state = await getOrgSubscriptionState(orgId)
  if (!state) return { ...parseSaasFeatures(null) }

  if (isOrgSaasReadOnly(state)) {
    const advanced = await getSaasPlanByName('advanced')
    return advanced?.features ?? { ...parseSaasFeatures(null) }
  }

  const trialActive =
    state.status === 'trial' &&
    state.trialEndsAt != null &&
    new Date(state.trialEndsAt).getTime() > Date.now()

  if (trialActive) {
    const advanced = await getSaasPlanByName('advanced')
    return advanced?.features ?? { ...parseSaasFeatures(null) }
  }

  return state.features
}

export function isTrialExpired(state: OrgSubscriptionState | null): boolean {
  if (!state || state.status !== 'trial' || !state.trialEndsAt) return false
  return new Date(state.trialEndsAt).getTime() <= Date.now()
}

export function isOrgSaasReadOnly(state: OrgSubscriptionState | null): boolean {
  if (!state) return false
  if (state.status === 'read_only') return true
  if (state.planName === 'free' && state.status === 'trial' && isTrialExpired(state)) return true
  return false
}

export async function assertOrgNotSaasReadOnly(orgId: string): Promise<void> {
  const state = await getOrgSubscriptionState(orgId)
  if (isOrgSaasReadOnly(state)) {
    throw new Error('SAAS_READ_ONLY')
  }
}

export async function listSaasInvoices(orgId: string) {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('saas_invoices')
    .select(
      'id, amount, currency, status, sumit_document_id, sumit_document_url, billing_period_start, billing_period_end, issued_at, created_at'
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function upsertTrialSubscription(orgId: string, planId: string): Promise<void> {
  const db = createServiceRoleClient()
  const trialEnds = new Date()
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS)

  const { error } = await db.from('organization_subscriptions').upsert(
    {
      organization_id: orgId,
      plan_id: planId,
      status: 'trial',
      billing_interval: 'monthly',
      trial_ends_at: trialEnds.toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: trialEnds.toISOString(),
      pending_checkout_reference: null,
    },
    { onConflict: 'organization_id' }
  )

  if (error) throw new Error(error.message)
}

export async function upsertPendingPaymentSubscription(params: {
  orgId: string
  planId: string
  billingInterval: 'monthly' | 'yearly'
  checkoutReference: string
}): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db.from('organization_subscriptions').upsert(
    {
      organization_id: params.orgId,
      plan_id: params.planId,
      status: 'pending_payment',
      billing_interval: params.billingInterval,
      pending_checkout_reference: params.checkoutReference,
      trial_ends_at: null,
    },
    { onConflict: 'organization_id' }
  )

  if (error) throw new Error(error.message)
}

export async function activateSubscriptionFromPayment(params: {
  orgId: string
  sumitCustomerId?: string | null
  sumitSubscriptionId?: string | null
  sumitPaymentToken?: string | null
  cardLastFour?: string | null
  invoice?: {
    amount: number
    sumitDocumentId?: string | null
    sumitDocumentUrl?: string | null
    billingPeriodStart?: string | null
    billingPeriodEnd?: string | null
  }
}): Promise<boolean> {
  const db = createServiceRoleClient()

  const { data: sub } = await db
    .from('organization_subscriptions')
    .select('id')
    .eq('organization_id', params.orgId)
    .maybeSingle()

  if (!sub) return false

  const periodStart = new Date()
  const periodEnd = new Date(periodStart)
  periodEnd.setMonth(periodEnd.getMonth() + 1)

  const { error: upErr } = await db
    .from('organization_subscriptions')
    .update({
      status: 'active',
      sumit_customer_id: params.sumitCustomerId ?? null,
      sumit_subscription_id: params.sumitSubscriptionId ?? null,
      sumit_payment_token: params.sumitPaymentToken ?? null,
      card_last_four: params.cardLastFour ?? null,
      pending_checkout_reference: null,
      trial_ends_at: null,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .eq('id', sub.id)

  if (upErr) throw new Error(upErr.message)

  if (params.invoice) {
    await db.from('saas_invoices').insert({
      organization_id: params.orgId,
      subscription_id: sub.id,
      amount: params.invoice.amount,
      currency: 'ILS',
      status: 'paid',
      sumit_document_id: params.invoice.sumitDocumentId ?? null,
      sumit_document_url: params.invoice.sumitDocumentUrl ?? null,
      billing_period_start: params.invoice.billingPeriodStart ?? periodStart.toISOString(),
      billing_period_end: params.invoice.billingPeriodEnd ?? periodEnd.toISOString(),
      issued_at: new Date().toISOString(),
    })
  }

  return true
}

/** Dev-only: mark pending subscription active without Sumit. */
export async function devMockActivatePendingSubscription(orgId: string): Promise<boolean> {
  if (process.env.SUMIT_CHECKOUT_MOCK !== '1') return false
  return activateSubscriptionFromPayment({
    orgId,
    sumitCustomerId: 'dev-mock',
    sumitSubscriptionId: 'dev-mock',
    invoice: { amount: 0 },
  })
}

export async function markOrganizationOnboardingComplete(orgId: string): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({ onboarding_completed: true })
    .eq('id', orgId)
  if (error) throw new Error(error.message)
}

export async function subscriptionAllowsDashboardAccess(
  orgId: string
): Promise<{ ok: boolean; reason?: 'pending_payment' | 'custom_inquiry' }> {
  const state = await getOrgSubscriptionState(orgId)
  if (!state) return { ok: true }

  if (state.status === 'pending_payment') return { ok: false, reason: 'pending_payment' }

  const inquiry = await getOpenCustomPlanInquiry(orgId)
  if (inquiry && state.status !== 'active' && state.status !== 'trial' && state.status !== 'read_only') {
    return { ok: false, reason: 'custom_inquiry' }
  }

  return { ok: true }
}
