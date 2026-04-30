import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getSaasPlanById } from '@/lib/saas/plans'
import { getOrgSubscriptionState } from '@/lib/saas/subscriptions'
import { Button } from '@/components/ui/button'
import {
  cancelPendingUpgradeCheckoutAction,
  completeMockUpgradeCheckoutAction,
} from '@/app/(dashboard)/account/billing/upgrade-actions'

export default async function AccountBillingMockPaymentPage() {
  if (process.env.SUMIT_CHECKOUT_MOCK !== '1') {
    redirect('/account/billing')
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

  if (!profile?.organization_id || profile.role !== 'owner') redirect('/account/billing')

  const orgId = profile.organization_id as string
  const state = await getOrgSubscriptionState(orgId)
  if (!state || state.status !== 'pending_payment') {
    redirect('/account/billing')
  }

  const plan = await getSaasPlanById(state.planId)
  if (!plan) redirect('/account/billing')

  const amount =
    state.billingInterval === 'yearly' && plan.price_yearly != null
      ? plan.price_yearly
      : plan.price_monthly

  const [t, tMock, locale] = await Promise.all([
    getTranslations('saas.accountBilling.mockPayment'),
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
    state.billingInterval === 'yearly' ? tMock('intervalYearly') : tMock('intervalMonthly')

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-8">
      <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-center text-xs font-medium text-amber-950 dark:border-amber-500/25 dark:bg-amber-950/35 dark:text-amber-100">
        {tMock('testBadge')}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 text-center">
        <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {tMock('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{tMock('subtitle')}</p>

        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/40 p-4 text-start">
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{tMock('plan')}</span>
            <span className="font-medium text-foreground">{planLabel}</span>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{tMock('billing')}</span>
            <span className="text-foreground">{intervalLabel}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-2 text-sm mt-2">
            <span className="text-muted-foreground">{tMock('amount')}</span>
            <span className="text-lg font-bold text-foreground">{formatted}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{tMock('hint')}</p>

        <div className="flex flex-col gap-2 pt-2">
          <form action={completeMockUpgradeCheckoutAction}>
            <Button type="submit" className="h-11 w-full font-semibold">
              {tMock('payNow')}
            </Button>
          </form>
          <form action={cancelPendingUpgradeCheckoutAction}>
            <Button type="submit" variant="ghost" className="w-full">
              {t('back')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
