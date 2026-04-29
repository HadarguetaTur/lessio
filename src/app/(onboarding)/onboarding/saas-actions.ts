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
} from '@/lib/saas/subscriptions'
import {
  createSumitHostedCheckoutUrl,
  getSumitCredentialsFromEnv,
} from '@/lib/saas/sumit-checkout'



const planNameSchema = z.enum(['free', 'basic', 'advanced', 'custom'])
const billingIntervalSchema = z.enum(['monthly', 'yearly'])

export async function startFreeTrialSaas(): Promise<{ error: string } | { ok: true }> {
  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return { error: 'אין הרשאה' }
  }

  const plan = await getSaasPlanByName('free')
  if (!plan) return { error: 'תוכנית לא נמצאה' }

  try {
    await upsertTrialSubscription(orgId, plan.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return { error: msg }
  }

  return { ok: true }
}

export async function beginPaidSaasCheckout(
  planName: SaasPlanName,
  billingInterval: 'monthly' | 'yearly'
): Promise<{ error: string } | { url: string; summary: BeginPaidCheckoutSummary }> {
  const parsedName = planNameSchema.safeParse(planName)
  const parsedInterval = billingIntervalSchema.safeParse(billingInterval)
  if (!parsedName.success || parsedName.data === 'free' || parsedName.data === 'custom') {
    return { error: 'תוכנית לא חוקית' }
  }
  if (!parsedInterval.success) return { error: 'מחזור חיוב לא חוקי' }

  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return { error: 'אין הרשאה' }
  }

  const plan = await getSaasPlanByName(parsedName.data)
  if (!plan) return { error: 'תוכנית לא נמצאה' }

  const amount =
    parsedInterval.data === 'yearly' && plan.price_yearly != null
      ? plan.price_yearly
      : plan.price_monthly

  if (amount <= 0) return { error: 'סכום לא חוקי' }

  const checkoutReference = crypto.randomUUID()
  try {
    await upsertPendingPaymentSubscription({
      orgId,
      planId: plan.id,
      billingInterval: parsedInterval.data,
      checkoutReference,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return { error: msg }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000'
  const successUrl = `${baseUrl}/onboarding/payment-callback`
  const failureUrl = `${baseUrl}/onboarding/payment-callback?failed=1`

  const creds = getSumitCredentialsFromEnv()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()

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
    })
    if ('error' in mock) return { error: mock.error }
    return {
      url: mock.url,
      summary: {
        planLabelHe: plan.display_name_he,
        planLabelEn: plan.display_name_en,
        amount,
        interval: parsedInterval.data,
        isSimulated: true,
      },
    }
  }

  if (!creds) {
    return {
      error:
        'חסרות הגדרות Sumit (SUMIT_COMPANY_ID / SUMIT_API_KEY) או הפעל SUMIT_CHECKOUT_MOCK=1 לסביבת טסט',
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

  if ('error' in hosted) return { error: hosted.error }
  return {
    url: hosted.url,
    summary: {
      planLabelHe: plan.display_name_he,
      planLabelEn: plan.display_name_en,
      amount,
      interval: parsedInterval.data,
      isSimulated: false,
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

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from('organization_subscriptions')
    .select('status')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (row?.status === 'pending_payment') {
    await db.from('organization_subscriptions').delete().eq('organization_id', orgId)
  }

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
  const parsed = inquirySchema.safeParse(input)
  if (!parsed.success) return { error: 'נתונים לא חוקיים' }

  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return { error: 'אין הרשאה' }
  }

  const db = createServiceRoleClient()
  const { error } = await db.from('saas_plan_inquiries').insert({
    organization_id: orgId,
    contact_name: parsed.data.contactName,
    phone: parsed.data.phone,
    message: parsed.data.message ?? null,
    status: 'open',
  })

  if (error) return { error: 'שמירת הפניה נכשלה' }

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

/** Called from payment-callback page with URL search params (mock / failure). */
export async function applyPaymentCallbackQuery(params: {
  mock?: string | null
  failed?: string | null
}): Promise<'dashboard' | 'pending' | 'failed'> {
  let orgId: string
  try {
    ;({ orgId } = await getOwnerOnboardingSession())
  } catch {
    return 'failed'
  }

  if (params.failed === '1') return 'failed'

  if (params.mock === '1' && process.env.SUMIT_CHECKOUT_MOCK === '1') {
    await devMockActivatePendingSubscription(orgId)
    await markOrganizationOnboardingComplete(orgId)
    return 'dashboard'
  }

  const { getOrgSubscriptionState } = await import('@/lib/saas/subscriptions')
  const state = await getOrgSubscriptionState(orgId)
  if (state?.status === 'active') {
    await markOrganizationOnboardingComplete(orgId)
    return 'dashboard'
  }

  return 'pending'
}
