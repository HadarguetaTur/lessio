'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSaasPlanByName } from '@/lib/saas/plans'
import type { BeginPaidCheckoutSummary, SaasPlanName } from '@/lib/saas/types'
import { getOwnerOnboardingSession } from '@/lib/auth/onboardingSession'
import {
  upsertTrialSubscription,
  upsertPendingPaymentSubscription,
  markOrganizationOnboardingComplete,
  devMockActivatePendingSubscription,
  revertPendingCheckout,
} from '@/lib/saas/subscriptions'
import { createSumitHostedCheckoutUrl, isSumitCheckoutMock } from '@/lib/saas/sumit-checkout'
import { hasSumitCredentials } from '@/lib/saas/sumit'
import {
  completeCheckoutReturn,
  type CheckoutReturnQuery,
} from '@/lib/saas/checkoutReturn'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getLocale, getTranslations } from 'next-intl/server'



const planNameSchema = z.enum([
  'free',
  'basic',
  'advanced',
  'solo',
  'studio',
  'center',
  'custom',
])
const billingIntervalSchema = z.enum(['monthly', 'yearly'])

export async function startFreeTrialSaas(): Promise<{ error: string } | { ok: true }> {
  const t = await getTranslations()
  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return { error: await commonError('noPermission') }
  }

  const plan = await getSaasPlanByName('free')
  if (!plan) return { error: t('validation.planNotFound') }

  try {
    await upsertTrialSubscription(orgId, plan.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : t('validation.genericError')
    return { error: msg }
  }

  return { ok: true }
}

export async function beginPaidSaasCheckout(
  planName: SaasPlanName,
  billingInterval: 'monthly' | 'yearly'
): Promise<{ error: string } | { url: string; summary: BeginPaidCheckoutSummary }> {
  const t = await getTranslations()
  const parsedName = planNameSchema.safeParse(planName)
  const parsedInterval = billingIntervalSchema.safeParse(billingInterval)
  if (!parsedName.success || parsedName.data === 'free' || parsedName.data === 'custom') {
    return { error: t('validation.invalidPlan') }
  }
  if (!parsedInterval.success) return { error: t('validation.invalidInterval') }

  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return { error: await commonError('noPermission') }
  }

  const plan = await getSaasPlanByName(parsedName.data)
  if (!plan) return { error: t('validation.planNotFound') }

  const amount =
    parsedInterval.data === 'yearly' && plan.price_yearly != null
      ? plan.price_yearly
      : plan.price_monthly

  if (amount <= 0) return { error: t('validation.invalidAmount') }

  const checkoutReference = crypto.randomUUID()

  const baseUrl = getShareableBaseUrl()
  const successUrl = `${baseUrl}/onboarding/payment-callback`
  const cancelUrl = `${baseUrl}/onboarding/payment-callback/cancelled`

  const isMock = isSumitCheckoutMock()
  if (!isMock && !hasSumitCredentials()) {
    return { error: t('validation.missingSumitConfig') }
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
    orgId,
    amount,
    description: `LESSIO ${locale === 'en' ? plan.display_name_en : plan.display_name_he}`,
    customerName: prof?.full_name ?? 'Owner',
    customerEmail: user?.email ?? null,
    customerPhone: null,
    reference: checkoutReference,
    successUrl,
    cancelUrl,
    language: locale,
  })

  if ('error' in checkout) return { error: checkout.error }

  try {
    await upsertPendingPaymentSubscription({
      orgId,
      planId: plan.id,
      billingInterval: parsedInterval.data,
      checkoutReference,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : t('validation.genericError')
    return { error: msg }
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

export async function completeMockSaasCheckoutAction(): Promise<void> {
  if (process.env.SUMIT_CHECKOUT_MOCK !== '1') {
    redirect('/onboarding')
  }
  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    redirect('/onboarding')
  }

  const { getOrgSubscriptionState } = await import('@/lib/saas/subscriptions')
  const state = await getOrgSubscriptionState(orgId)
  if (!state || state.status !== 'pending_payment') {
    redirect('/onboarding')
  }

  await devMockActivatePendingSubscription(orgId)
  await markOrganizationOnboardingComplete(orgId)
  redirect('/dashboard')
}

export async function cancelPendingSaasCheckoutAction(): Promise<void> {
  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    redirect('/onboarding')
  }

  // Revert, never delete: an org with no subscription row reads as
  // grandfathered and gets the full product for free. See revertPendingCheckout.
  await revertPendingCheckout(orgId)

  redirect('/onboarding')
}

const inquirySchema = z.object({
  contactName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(30),
  message: z.string().trim().max(2000).optional(),
})

export async function submitCustomSaasPlanInquiry(
  input: z.infer<typeof inquirySchema>
): Promise<{ error: string } | void> {
  const t = await getTranslations()
  const parsed = inquirySchema.safeParse(input)
  if (!parsed.success) return { error: t('validation.invalidData') }

  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return { error: await commonError('noPermission') }
  }

  const db = createServiceRoleClient()
  const { error } = await db.from('saas_plan_inquiries').insert({
    organization_id: orgId,
    contact_name: parsed.data.contactName,
    phone: parsed.data.phone,
    message: parsed.data.message ?? null,
    status: 'open',
  })

  if (error) return { error: t('validation.saveReferralFailed') }

  redirect('/onboarding/pending-custom')
}

export async function checkSaasActivationAndComplete(): Promise<'dashboard' | 'pending'> {
  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return 'pending'
  }

  const { getOrgSubscriptionState } = await import('@/lib/saas/subscriptions')
  const state = await getOrgSubscriptionState(orgId)
  if (state?.status === 'active') {
    await markOrganizationOnboardingComplete(orgId)
    return 'dashboard'
  }
  return 'pending'
}

export type OnboardingCallbackResult = 'dashboard' | 'pending' | 'failed' | 'cancelled' | 'refused'

/**
 * The Sumit redirect-return during onboarding. Same binding rules and the same
 * activation as the in-app upgrade — see @/lib/saas/checkoutReturn.
 */
export async function applyPaymentCallbackQuery(
  params: CheckoutReturnQuery & { mock?: string | null }
): Promise<OnboardingCallbackResult> {
  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return 'failed'
  }

  if (params.mock === '1' && isSumitCheckoutMock()) {
    await devMockActivatePendingSubscription(orgId)
    await markOrganizationOnboardingComplete(orgId)
    return 'dashboard'
  }

  const { outcome } = await completeCheckoutReturn({
    orgId,
    query: {
      paymentId: params.paymentId,
      customerId: params.customerId,
      externalIdentifier: params.externalIdentifier,
      cancelled: params.cancelled,
    },
    source: 'callback',
  })

  if (outcome === 'activated' || outcome === 'already_active') return 'dashboard'
  if (outcome === 'cancelled') return 'cancelled'
  if (outcome === 'refused') return 'refused'
  return 'pending'
}
