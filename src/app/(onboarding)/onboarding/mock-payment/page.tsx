import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getSaasPlanById } from '@/lib/saas/plans'
import { getOrgSubscriptionState } from '@/lib/saas/subscriptions'
import { Button } from '@/components/ui/button'
import {
  cancelPendingSaasCheckoutAction,
  completeMockSaasCheckoutAction,
} from '@/app/(onboarding)/onboarding/saas-actions'
import { onboardingGradientCta, onboardingPanelCard, onboardingPanelPadding } from '@/components/onboarding/onboardingVisual'

export default async function MockPaymentPage() {
  if (process.env.SUMIT_CHECKOUT_MOCK !== '1') {
    redirect('/onboarding')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id || profile.role !== 'owner') redirect('/onboarding')

  const orgId = profile.organization_id as string
  const state = await getOrgSubscriptionState(orgId)
  if (!state || state.status !== 'pending_payment') {
    redirect('/onboarding')
  }

  const plan = await getSaasPlanById(state.planId)
  if (!plan) redirect('/onboarding')

  const amount =
    state.billingInterval === 'yearly' && plan.price_yearly != null
      ? plan.price_yearly
      : plan.price_monthly

  const [t, locale] = await Promise.all([
    getTranslations('onboarding.mockPayment'),
    getLocale(),
  ])

  const planLabel = locale === 'he' ? plan.display_name_he : plan.display_name_en
  const formatted = new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(amount)

  const intervalLabel =
    state.billingInterval === 'yearly' ? t('intervalYearly') : t('intervalMonthly')

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-center text-xs font-medium text-amber-950 dark:border-amber-500/25 dark:bg-amber-950/35 dark:text-amber-100">
        {t('testBadge')}
      </div>

      <div className={`space-y-4 text-center ${onboardingPanelCard} ${onboardingPanelPadding}`}>
        <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>

        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/40 p-4 text-start">
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{t('plan')}</span>
            <span className="font-medium text-foreground">{planLabel}</span>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{t('billing')}</span>
            <span className="text-foreground">{intervalLabel}</span>
          </div>
          <div className="flex justify-between gap-4 text-sm border-t border-border pt-2 mt-2">
            <span className="text-muted-foreground">{t('amount')}</span>
            <span className="text-lg font-bold text-foreground">{formatted}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t('hint')}</p>

        <div className="flex flex-col gap-2 pt-2">
          <form action={completeMockSaasCheckoutAction}>
            <Button type="submit" className={`h-11 w-full font-semibold ${onboardingGradientCta}`}>
              {t('payNow')}
            </Button>
          </form>
          <form action={cancelPendingSaasCheckoutAction}>
            <Button type="submit" variant="ghost" className="w-full">
              {t('back')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
