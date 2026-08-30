'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { cn } from '@/lib/utils'
import type { SaasPlanRow } from '@/lib/saas/plans'
import type { BeginPaidCheckoutSummary } from '@/lib/saas/types'
import type { beginUpgradeCheckoutAction } from '@/app/(dashboard)/account/billing/upgrade-actions'

export type UpgradeCheckoutActionFn = typeof beginUpgradeCheckoutAction

type UpgradePlanPanelProps = {
  upgradePlans: SaasPlanRow[]
  beginUpgradeCheckout: UpgradeCheckoutActionFn
  /** True for legacy orgs that have no subscription row yet — changes section copy. */
  isNewSubscription?: boolean
}

export function UpgradePlanPanel({
  upgradePlans,
  beginUpgradeCheckout,
  isNewSubscription = false,
}: UpgradePlanPanelProps) {
  const t = useTranslations('saas.accountBilling.upgrade')
  const tCheckout = useTranslations('onboarding.checkoutPreview')

  const locale = useLocale()
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [externalCheckout, setExternalCheckout] = useState<{
    url: string
    summary: BeginPaidCheckoutSummary
  } | null>(null)

  const money = (n: number) => formatCurrency(n, locale)

  const planLabelForSummary = (s: BeginPaidCheckoutSummary) =>
    locale === 'he' ? s.planLabelHe : s.planLabelEn

  const formatSummaryAmount = (s: BeginPaidCheckoutSummary) => formatCurrency(s.amount, locale)

  const resolveErrorMessage = (code: string | undefined, raw?: string): string => {
    switch (code) {
      case 'READ_ONLY_SESSION':
        return t('errors.readOnlySession')
      case 'OWNER_ONLY':
        return t('errors.ownerOnly')
      case 'INVALID_INPUT':
        return t('errors.invalidInput')
      case 'NO_SUBSCRIPTION':
        return t('errors.noSubscription')
      case 'UPGRADE_UNAVAILABLE':
        return t('errors.upgradeUnavailable')
      case 'PLAN_NOT_FOUND':
        return t('errors.planNotFound')
      case 'NOT_AN_UPGRADE':
        return t('errors.notUpgrade')
      case 'INVALID_AMOUNT':
        return t('errors.invalidAmount')
      case 'UPSERT_FAILED':
        return t('errors.upsertFailed')
      case 'SUMIT_ENV_MISSING':
        return t('errors.sumitEnvMissing')
      case 'CHECKOUT_URL':
        return t('errors.checkoutUrl')
      default:
        return raw ?? t('errors.generic')
    }
  }

  const onPaid = (name: 'basic' | 'advanced') => {
    setError(null)
    setExternalCheckout(null)
    startTransition(async () => {
      const res = await beginUpgradeCheckout(name, interval)
      if ('error' in res) {
        setError(resolveErrorMessage(res.errorCode, res.error))
        return
      }
      if (res.summary.isSimulated) {
        window.location.href = res.url
        return
      }
      setExternalCheckout({ url: res.url, summary: res.summary })
    })
  }

  if (upgradePlans.length === 0) return null

  const planCardBase =
    'relative flex h-full min-h-0 min-w-0 w-full flex-col gap-4 rounded-2xl border border-border/70 bg-card px-6 pb-5 pt-6 shadow-sm transition-[box-shadow,border-color] duration-200'

  const planCardFeatured =
    'border-2 border-primary/35 bg-muted/20 pt-11 shadow-md ring-2 ring-primary/10'

  const priceBlock = (monthly: number, yearly: number | null) => (
    <div className="shrink-0 text-end tabular-nums" dir="ltr">
      <span className="text-2xl font-bold leading-none tracking-tight text-foreground">
        {interval === 'yearly' && yearly != null ? money(yearly) : money(monthly)}
      </span>
      <span className="mt-1 block text-[11px] font-medium text-muted-foreground">
        {interval === 'yearly' ? t('perYear') : t('perMonth')}
      </span>
    </div>
  )

  return (
    <section className="space-y-4" aria-labelledby="upgrade-heading">
      <div>
        <h2 id="upgrade-heading" className="text-sm font-semibold text-foreground">
          {isNewSubscription ? t('sectionTitleNew') : t('sectionTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isNewSubscription ? t('sectionSubtitleNew') : t('sectionSubtitle')}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 px-4 py-5 shadow-inner sm:px-6">
        {!externalCheckout ? (
          <div className="mb-6 flex justify-center">
            <div
              className="inline-flex rounded-full border border-border/80 bg-muted/60 p-1 shadow-inner"
              role="group"
              aria-label={`${t('billingMonthly')} / ${t('billingYearly')}`}
            >
              <button
                type="button"
                className={cn(
                  'rounded-full px-5 py-2 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  interval === 'monthly'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setInterval('monthly')}
              >
                {t('billingMonthly')}
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-full px-5 py-2 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  interval === 'yearly'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setInterval('yearly')}
              >
                {t('billingYearly')}
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            className="mb-6 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-center"
            role="alert"
          >
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        ) : null}

        {externalCheckout ? (
          <div className="mx-auto max-w-md space-y-5 rounded-2xl border border-primary/30 bg-muted/30 p-6 shadow-md">
            <h3 className="text-center text-lg font-semibold tracking-tight text-foreground">
              {tCheckout('title')}
            </h3>
            <div className="space-y-3 rounded-xl border border-border/80 bg-background/90 p-4 text-sm shadow-inner">
              <div className="flex justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">{tCheckout('plan')}</span>
                <span className="min-w-0 break-words text-end font-medium text-foreground">
                  {planLabelForSummary(externalCheckout.summary)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{tCheckout('amount')}</span>
                <span className="tabular-nums font-semibold text-foreground" dir="ltr">
                  {formatSummaryAmount(externalCheckout.summary)}
                </span>
              </div>
              <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                {tCheckout('externalNote')}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="h-11 w-full font-semibold"
                onClick={() => {
                  window.location.href = externalCheckout.url
                }}
              >
                {tCheckout('continuePay')}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setExternalCheckout(null)}>
                {tCheckout('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {upgradePlans.map((plan) => {
              const featured = plan.name === 'advanced'
              const rawBullets = t.raw(`plans.${plan.name}.bullets`)
              const bullets = Array.isArray(rawBullets) ? (rawBullets as string[]) : []
              return (
                <div key={plan.id} className={cn(planCardBase, featured && planCardFeatured)}>
                  {featured ? (
                    <div className="pointer-events-none absolute -top-3 inset-x-0 flex justify-center px-2">
                      <Badge
                        variant="default"
                        className="pointer-events-auto border-0 bg-primary text-primary-foreground shadow-sm"
                      >
                        {t('popularBadge')}
                      </Badge>
                    </div>
                  ) : null}
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      {locale === 'he' ? plan.display_name_he : plan.display_name_en}
                    </h3>
                    {priceBlock(plan.price_monthly, plan.price_yearly)}
                  </div>
                  {bullets.length > 0 ? (
                    <ul className="flex-1 space-y-2 text-[0.8125rem] leading-snug text-foreground [&:last-child]:pb-0">
                      {bullets.map((line, i) => (
                        <li key={i} className="flex gap-2">
                          <Check
                            className="mt-[0.2rem] size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
                            aria-hidden
                          />
                          <span className="min-w-0 break-words">{line}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Button
                    type="button"
                    className="mt-1 h-11 w-full font-semibold"
                    disabled={pending}
                    onClick={() => onPaid(plan.name as 'basic' | 'advanced')}
                  >
                    {t('ctaUpgrade')}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
