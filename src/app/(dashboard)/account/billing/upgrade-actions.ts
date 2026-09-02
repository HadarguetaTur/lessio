'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getSaasPlanById, getSaasPlanByName } from '@/lib/saas/plans'
import {
  PURCHASABLE_PLAN_NAMES,
  type PurchasableSaasPlanName,
} from '@/lib/saas/planPresentation'
import { evaluateUpgrade } from '@/lib/saas/upgradeEligibility'
import { isRepurchase } from '@/lib/saas/repurchase'
import { getOrgQuotaUsage } from '@/lib/saas/quota'
import type { BeginPaidCheckoutSummary, SaasPlanName } from '@/lib/saas/types'
import {
  devMockActivatePendingSubscription,
  getOrgSubscriptionState,
  markOrganizationOnboardingComplete,
  revertPendingCheckout,
  upsertPendingPaymentSubscription,
  type OrgSubscriptionState,
} from '@/lib/saas/subscriptions'
import { createSumitHostedCheckoutUrl, isSumitCheckoutMock } from '@/lib/saas/sumit-checkout'
import { hasSumitCredentials } from '@/lib/saas/sumit'
import {
  completeCheckoutReturn,
  type CheckoutReturnQuery,
  type CheckoutReturnOutcome,
} from '@/lib/saas/checkoutReturn'
import { getLocale } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getShareableBaseUrl } from '@/lib/url/appUrl'

const planNameSchema = z.enum(PURCHASABLE_PLAN_NAMES)
const billingIntervalSchema = z.enum(['monthly', 'yearly'])

function canStartUpgradeCheckout(state: OrgSubscriptionState | null): boolean {
  if (!state) return false
  if (state.planName === 'custom') return false
  if (
    state.status !== 'trial' &&
    state.status !== 'active' &&
    state.status !== 'read_only' &&
    // A lapsed customer must be able to pay their way back in. These used to be
    // excluded, so the "update your payment method" link in a dunning email led
    // to a page that refused every plan — including the one they already had.
    state.status !== 'past_due' &&
    state.status !== 'cancelled' &&
    // A previous checkout that was never completed — allow restarting it.
    state.status !== 'pending_payment'
  ) {
    return false
  }
  return true
}


/**
 * Validates that checking out the target plan is allowed.
 * Legacy orgs (no subscription row) may freely choose any paid plan.
 *
 * The rule itself lives in @/lib/saas/upgradeEligibility so that the billing
 * page offers exactly the plans this action will accept — they used to be two
 * hand-maintained copies, and the page could show a card this rejected.
 */
async function assertUpgradeAllowed(
  orgId: string,
  targetPlanName: PurchasableSaasPlanName
): Promise<{ ok: true } | { ok: false; error: string }> {
  const targetPlan = await getSaasPlanByName(targetPlanName)
  if (!targetPlan) return { ok: false, error: 'PLAN_NOT_FOUND' }

  const state = await getOrgSubscriptionState(orgId)
  const usage = await getOrgQuotaUsage(orgId)

  // Legacy org — no subscription row yet. No ladder to climb, but the target
  // still has to be able to hold what they already have.
  if (!state) {
    return toResult(evaluateUpgrade({ current: null, target: targetPlan, usage }))
  }

  if (!canStartUpgradeCheckout(state)) {
    return { ok: false, error: 'UPGRADE_UNAVAILABLE' }
  }

  // A pending, lapsed or cancelled subscription is not an active plan — allow
  // (re)starting checkout for any paid plan, subject only to the usage check.
  if (isRepurchase(state)) {
    return toResult(evaluateUpgrade({ current: null, target: targetPlan, usage }))
  }

  const currentPlan = await getSaasPlanById(state.planId)
  if (!currentPlan) {
    return { ok: false, error: 'PLAN_NOT_FOUND' }
  }

  return toResult(evaluateUpgrade({ current: currentPlan, target: targetPlan, usage }))
}

function toResult(
  verdict: ReturnType<typeof evaluateUpgrade>
): { ok: true } | { ok: false; error: string } {
  return verdict.ok ? { ok: true } : { ok: false, error: verdict.reason }
}

export async function beginUpgradeCheckoutAction(
  planName: SaasPlanName,
  billingInterval: 'monthly' | 'yearly'
): Promise<
  { error: string; errorCode?: string } | { url: string; summary: BeginPaidCheckoutSummary }
> {
  const session = await getSession()
  try {
    requireMutation(session, { allowWhenLapsed: true })
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

  const baseUrl = getShareableBaseUrl()
  const successUrl = `${baseUrl}/account/billing/payment-callback`
  const cancelUrl = `${baseUrl}/account/billing/payment-callback/cancelled`
  const mockPath = '/account/billing/mock-payment'

  const isMock = isSumitCheckoutMock()
  if (!isMock && !hasSumitCredentials()) {
    return { error: 'SUMIT_ENV_MISSING', errorCode: 'SUMIT_ENV_MISSING' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()

  // Create the checkout link first — only mark the subscription pending once a link exists,
  // so a failed Sumit call never leaves the org stuck in `pending_payment`.
  const locale = parseAppLocale(await getLocale())
  const checkout = await createSumitHostedCheckoutUrl({
    orgId: session.orgId,
    amount,
    description: `LESSIO ${locale === 'en' ? plan.display_name_en : plan.display_name_he}`,
    customerName: prof?.full_name ?? 'Owner',
    customerEmail: user?.email ?? null,
    customerPhone: null,
    reference: checkoutReference,
    successUrl,
    cancelUrl,
    language: locale,
    ...(isMock ? { mockPaymentPath: mockPath } : {}),
  })

  if ('error' in checkout) return { error: checkout.error, errorCode: 'CHECKOUT_URL' }

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

  return {
    url: checkout.url,
    summary: {
      planLabelHe: plan.display_name_he,
      planLabelEn: plan.display_name_en,
      amount,
      interval: parsedInterval.data,
      isSimulated: isMock,
    },
  }
}

/** After confirming mock Sumit checkout (SUMIT_CHECKOUT_MOCK only). */
export async function completeMockUpgradeCheckoutAction(): Promise<void> {
  if (process.env.SUMIT_CHECKOUT_MOCK !== '1') {
    redirect('/account/billing')
  }
  const session = await getSession()
  try {
    requireMutation(session, { allowWhenLapsed: true })
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
    requireMutation(session, { allowWhenLapsed: true })
  } catch {
    redirect('/account/billing')
  }
  if (session.role !== 'owner') redirect('/account/billing')

  // Reverts to the pre-checkout plan and status. Deleting the row instead — as
  // this used to — made the org look grandfathered and handed it the full
  // product for free. See revertPendingCheckout.
  await revertPendingCheckout(session.orgId)

  revalidatePath('/account/billing')
  redirect('/account/billing')
}

export type BillingCallbackResult = 'billing' | 'pending' | 'failed' | 'cancelled' | 'refused'

/**
 * Applies the Sumit redirect-return at `/account/billing/payment-callback`.
 * The binding rules and the activation live in @/lib/saas/checkoutReturn, which
 * the onboarding callback and the webhook share.
 */
export async function applyAccountBillingPaymentCallbackQuery(
  params: CheckoutReturnQuery & { mock?: string | null }
): Promise<BillingCallbackResult> {
  const session = await getSession()
  if (session.role !== 'owner') return 'failed'

  if (params.mock === '1' && isSumitCheckoutMock()) {
    await devMockActivatePendingSubscription(session.orgId)
    await markOrganizationOnboardingComplete(session.orgId)
    revalidatePath('/account/billing')
    return 'billing'
  }

  const { outcome } = await completeCheckoutReturn({
    orgId: session.orgId,
    query: {
      paymentId: params.paymentId,
      customerId: params.customerId,
      externalIdentifier: params.externalIdentifier,
      cancelled: params.cancelled,
    },
    source: 'callback',
  })

  revalidatePath('/account/billing')
  return mapCheckoutOutcome(outcome)
}

function mapCheckoutOutcome(outcome: CheckoutReturnOutcome): BillingCallbackResult {
  if (outcome === 'activated' || outcome === 'already_active') return 'billing'
  if (outcome === 'cancelled') return 'cancelled'
  if (outcome === 'refused') return 'refused'
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
