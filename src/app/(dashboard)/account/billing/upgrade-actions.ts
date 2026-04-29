'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getSaasPlanById, getSaasPlanByName } from '@/lib/saas/plans'
import type { BeginPaidCheckoutSummary, SaasPlanName } from '@/lib/saas/types'
import {
  devMockActivatePendingSubscription,
  getOrgSubscriptionState,
  markOrganizationOnboardingComplete,
  upsertPendingPaymentSubscription,
  type OrgSubscriptionState,
} from '@/lib/saas/subscriptions'
import {
  createSumitHostedCheckoutUrl,
  getSumitCredentialsFromEnv,
} from '@/lib/saas/sumit-checkout'

const planNameSchema = z.enum(['basic', 'advanced'])
const billingIntervalSchema = z.enum(['monthly', 'yearly'])

function canStartUpgradeCheckout(state: OrgSubscriptionState | null): boolean {
  if (!state) return false
  if (state.planName === 'custom') return false
  if (
    state.status !== 'trial' &&
    state.status !== 'active' &&
    state.status !== 'read_only'
  ) {
    return false
  }
  return true
}

/**
 * Validates that checking out the target plan is allowed.
 * Legacy orgs (no subscription row) may freely choose any paid plan.
 */
async function assertUpgradeAllowed(
  orgId: string,
  targetPlanName: 'basic' | 'advanced'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = await getOrgSubscriptionState(orgId)

  if (!state) {
    // Legacy org — no subscription row yet, any paid plan is valid.
    const targetPlan = await getSaasPlanByName(targetPlanName)
    if (!targetPlan) return { ok: false, error: 'PLAN_NOT_FOUND' }
    return { ok: true }
  }

  if (!canStartUpgradeCheckout(state)) {
    return { ok: false, error: 'UPGRADE_UNAVAILABLE' }
  }

  const currentPlan = await getSaasPlanById(state.planId)
  const targetPlan = await getSaasPlanByName(targetPlanName)
  if (!currentPlan || !targetPlan) {
    return { ok: false, error: 'PLAN_NOT_FOUND' }
  }
  if (targetPlan.sort_order <= currentPlan.sort_order) {
    return { ok: false, error: 'NOT_AN_UPGRADE' }
  }
  return { ok: true }
}

export async function beginUpgradeCheckoutAction(
  planName: SaasPlanName,
  billingInterval: 'monthly' | 'yearly'
): Promise<
  { error: string; errorCode?: string } | { url: string; summary: BeginPaidCheckoutSummary }
> {
  const session = await getSession()
  try {
    requireMutation(session)
  } catch {
    return { error: 'READ_ONLY_SESSION', errorCode: 'READ_ONLY_SESSION' }
  }
  if (session.role !== 'owner') {
    return { error: 'OWNER_ONLY', errorCode: 'OWNER_ONLY' }
  }

  const parsedName = planNameSchema.safeParse(planName)
  const parsedInterval = billingIntervalSchema.safeParse(billingInterval)
  if (!parsedName.success || !parsedInterval.success) {
    return { error: 'INVALID_INPUT', errorCode: 'INVALID_INPUT' }
  }

  const allowed = await assertUpgradeAllowed(session.orgId, parsedName.data)
  if (!allowed.ok) {
    return { error: allowed.error, errorCode: allowed.error }
  }

  const plan = await getSaasPlanByName(parsedName.data)
  if (!plan) return { error: 'PLAN_NOT_FOUND', errorCode: 'PLAN_NOT_FOUND' }

  const amount =
    parsedInterval.data === 'yearly' && plan.price_yearly != null
      ? plan.price_yearly
      : plan.price_monthly

  if (amount <= 0) return { error: 'INVALID_AMOUNT', errorCode: 'INVALID_AMOUNT' }

  const checkoutReference = crypto.randomUUID()
  try {
    await upsertPendingPaymentSubscription({
      orgId: session.orgId,
      planId: plan.id,
      billingInterval: parsedInterval.data,
      checkoutReference,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN'
    return { error: msg, errorCode: 'UPSERT_FAILED' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000'
  const successUrl = `${baseUrl}/account/billing/payment-callback`
  const failureUrl = `${baseUrl}/account/billing/payment-callback?failed=1`
  const mockPath = '/account/billing/mock-payment'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()

  const summaryBase: Omit<BeginPaidCheckoutSummary, 'isSimulated'> = {
    planLabelHe: plan.display_name_he,
    planLabelEn: plan.display_name_en,
    amount,
    interval: parsedInterval.data,
  }

  if (process.env.SUMIT_CHECKOUT_MOCK === '1') {
    const mock = await createSumitHostedCheckoutUrl({
      companyId: 'mock',
      apiKey: 'mock',
      amount,
      description: `LESSIO ${plan.display_name_he}`,
      customerName: prof?.full_name ?? 'Owner',
      customerEmail: user?.email ?? null,
      customerPhone: null,
      reference: checkoutReference,
      successUrl,
      failureUrl,
      mockPaymentPath: mockPath,
    })
    if ('error' in mock) return { error: mock.error, errorCode: 'CHECKOUT_URL' }
    return {
      url: mock.url,
      summary: { ...summaryBase, isSimulated: true },
    }
  }

  const creds = getSumitCredentialsFromEnv()
  if (!creds) {
    return {
      error: 'SUMIT_ENV_MISSING',
      errorCode: 'SUMIT_ENV_MISSING',
    }
  }

  const hosted = await createSumitHostedCheckoutUrl({
    companyId: creds.companyId,
    apiKey: creds.apiKey,
    amount,
    description: `LESSIO ${plan.display_name_he}`,
    customerName: prof?.full_name ?? 'Owner',
    customerEmail: user?.email ?? null,
    customerPhone: null,
    reference: checkoutReference,
    successUrl,
    failureUrl,
  })

  if ('error' in hosted) return { error: hosted.error, errorCode: 'CHECKOUT_URL' }
  return {
    url: hosted.url,
    summary: { ...summaryBase, isSimulated: false },
  }
}

/** After confirming mock Sumit checkout (SUMIT_CHECKOUT_MOCK only). */
export async function completeMockUpgradeCheckoutAction(): Promise<void> {
  if (process.env.SUMIT_CHECKOUT_MOCK !== '1') {
    redirect('/account/billing')
  }
  const session = await getSession()
  try {
    requireMutation(session)
  } catch {
    redirect('/account/billing')
  }
  if (session.role !== 'owner') redirect('/account/billing')

  const state = await getOrgSubscriptionState(session.orgId)
  if (!state || state.status !== 'pending_payment') {
    redirect('/account/billing')
  }

  await devMockActivatePendingSubscription(session.orgId)
  await markOrganizationOnboardingComplete(session.orgId)
  revalidatePath('/account/billing')
  redirect('/account/billing')
}

export async function cancelPendingUpgradeCheckoutAction(): Promise<void> {
  const session = await getSession()
  try {
    requireMutation(session)
  } catch {
    redirect('/account/billing')
  }
  if (session.role !== 'owner') redirect('/account/billing')

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from('organization_subscriptions')
    .select('status')
    .eq('organization_id', session.orgId)
    .maybeSingle()

  if (row?.status === 'pending_payment') {
    await db.from('organization_subscriptions').delete().eq('organization_id', session.orgId)
  }

  revalidatePath('/account/billing')
  redirect('/account/billing')
}

/**
 * Applies URL params from `/account/billing/payment-callback` (same semantics as onboarding callback).
 */
export async function applyAccountBillingPaymentCallbackQuery(params: {
  mock?: string | null
  failed?: string | null
}): Promise<'billing' | 'pending' | 'failed'> {
  const session = await getSession()
  if (session.role !== 'owner') return 'failed'

  if (params.failed === '1') return 'failed'

  if (params.mock === '1' && process.env.SUMIT_CHECKOUT_MOCK === '1') {
    await devMockActivatePendingSubscription(session.orgId)
    await markOrganizationOnboardingComplete(session.orgId)
    revalidatePath('/account/billing')
    return 'billing'
  }

  const state = await getOrgSubscriptionState(session.orgId)
  if (state?.status === 'active') {
    await markOrganizationOnboardingComplete(session.orgId)
    revalidatePath('/account/billing')
    return 'billing'
  }

  return 'pending'
}

export async function checkUpgradeActivationAction(): Promise<'billing' | 'pending'> {
  const session = await getSession()
  if (session.role !== 'owner') return 'pending'

  const state = await getOrgSubscriptionState(session.orgId)
  if (state?.status === 'active') {
    await markOrganizationOnboardingComplete(session.orgId)
    revalidatePath('/account/billing')
    return 'billing'
  }

  return 'pending'
}
