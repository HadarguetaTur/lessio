'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Building2, Check, Sparkles, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { cn } from '@/lib/utils'
import type { SaasPlanRow } from '@/lib/saas/plans'
import type { PurchasableSaasPlanName } from '@/lib/saas/planPresentation'
import type { SaasPlanName } from '@/lib/saas/types'
import type { BeginPaidCheckoutSummary } from '@/lib/saas/types'
import {
  beginPaidSaasCheckout,
  startFreeTrialSaas,
  submitCustomSaasPlanInquiry,
} from '@/app/(onboarding)/onboarding/saas-actions'
import { onboardingGradientCta } from '@/components/onboarding/onboardingVisual'

function paidCheckoutMode(): 'stub' | 'sumit' {
  return process.env.NEXT_PUBLIC_ONBOARDING_PAID_CHECKOUT === 'sumit' ? 'sumit' : 'stub'
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'string') ? (value as string[]) : []
}

function PlanBulletList({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <ul
      className={cn(
        'space-y-2 text-[0.8125rem] leading-snug text-foreground [&:last-child]:pb-0',
        className
      )}
    >
      {items.map((line, i) => (
        <li key={i} className="flex gap-2">
          <Check className="mt-[0.2rem] size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
          <span className="min-w-0 break-words">{line}</span>
        </li>
      ))}
    </ul>
  )
}

function PlanBestFor({ label, text }: { label: string; text: string }) {
  return (
    <p className="border-t border-border/50 pt-3 text-xs leading-relaxed text-muted-foreground">
      <span className="font-semibold text-foreground">{label}</span>
      {text}
    </p>
  )
}

interface PlanSelectionStepProps {
  plans: SaasPlanRow[]
  onBack: () => void
  onFreeContinue: () => void
  /** Shown after “pay” in stub mode so onboarding can finish without charging */
  onContinueWithoutPayment: () => void
}

export function PlanSelectionStep({
  plans,
  onBack,
  onFreeContinue,
  onContinueWithoutPayment,
}: PlanSelectionStepProps) {
  const t = useTranslations('onboarding.planSelection')
  const tCheckout = useTranslations('onboarding.checkoutPreview')

  const locale = useLocale()
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [externalCheckout, setExternalCheckout] = useState<{
    url: string
    summary: BeginPaidCheckoutSummary
  } | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [paymentStub, setPaymentStub] = useState(false)

  const planByName = (name: SaasPlanName) => plans.find((p) => p.name === name)

  const money = (n: number) => formatCurrency(n, locale)

  const onFree = () => {
    setError(null)
    startTransition(async () => {
      const res = await startFreeTrialSaas()
      if ('error' in res) {
        setError(res.error)
        return
      }
      onFreeContinue()
    })
  }

  const onPaid = (name: PurchasableSaasPlanName) => {
    setError(null)
    setExternalCheckout(null)
    if (paidCheckoutMode() === 'stub') {
      setPaymentStub(true)
      return
    }
    startTransition(async () => {
      const res = await beginPaidSaasCheckout(name, interval)
      if ('error' in res) {
        setError(res.error)
        return
      }
      if (res.summary.isSimulated) {
        window.location.href = res.url
        return
      }
      setExternalCheckout({ url: res.url, summary: res.summary })
    })
  }

  const planLabelForSummary = (s: BeginPaidCheckoutSummary) =>
    locale === 'he' ? s.planLabelHe : s.planLabelEn

  const formatSummaryAmount = (s: BeginPaidCheckoutSummary) => formatCurrency(s.amount, locale)

  const onCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await submitCustomSaasPlanInquiry({
        contactName,
        phone,
        message: message || undefined,
      })
      if (res && 'error' in res) setError(res.error)
    })
  }

  const free = planByName('free')
  const solo = planByName('solo')
  const studio = planByName('studio')
  const center = planByName('center')
  const custom = planByName('custom')

  const outcomes = asStringArray(t.raw('outcomes'))
  const freeBullets = asStringArray(t.raw('plans.free.bullets'))
  const soloBullets = asStringArray(t.raw('plans.solo.bullets'))
  const studioBullets = asStringArray(t.raw('plans.studio.bullets'))
  const centerBullets = asStringArray(t.raw('plans.center.bullets'))
  // The custom-plan strip below the grid. Center is now a real tier, so the
  // inquiry form needed a key of its own.
  const customBullets = asStringArray(t.raw('plans.custom.bullets'))

  const planCardBase =
    'relative flex h-full min-h-0 min-w-0 w-full flex-col gap-4 rounded-2xl border border-border/70 bg-card px-6 pb-5 pt-6 shadow-sm transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-violet-400/35 hover:shadow-md xl:w-auto xl:shrink'

  const planCardFeatured =
    'border-2 border-violet-500/45 bg-gradient-to-b from-violet-600/[0.08] via-card to-card pt-11 shadow-lg ring-2 ring-violet-500/15 hover:border-violet-500/60 hover:shadow-xl xl:-translate-y-1'

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

  const faqItems = [
    { q: t('faq.upgrade.q'), a: t('faq.upgrade.a') },
    { q: t('faq.trial.q'), a: t('faq.trial.a') },
    { q: t('faq.choose.q'), a: t('faq.choose.a') },
    { q: t('faq.cancel.q'), a: t('faq.cancel.a') },
  ]

  return (
    <div className="w-full min-w-0 px-0 sm:px-1">
      <header className="mb-8 text-center sm:mb-10">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-violet-600/25 text-teal-600 shadow-md ring-1 ring-violet-500/20 dark:text-teal-300">
          <Sparkles className="size-7" aria-hidden />
        </div>
        <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t('title')}</h2>
        <p className="mx-auto mt-4 max-w-3xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-[1.05rem]">
          {t('subtitle')}
        </p>
      </header>

      {outcomes.length > 0 ? (
        <div className="mx-auto mb-9 max-w-2xl rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] px-5 py-5 sm:px-6">
          {t('outcomesIntro').trim() ? (
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('outcomesIntro')}
            </p>
          ) : null}
          <ul className="grid gap-2.5 text-sm text-muted-foreground md:grid-cols-3">
            {outcomes.map((line, i) => (
              <li key={i} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
                <span className="min-w-0 leading-snug">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section
        className="rounded-3xl border border-border/60 bg-card/30 px-4 py-7 shadow-sm sm:px-7 sm:py-9"
        aria-label={t('pricingSectionAria')}
      >
        {!externalCheckout ? (
          <div className="mb-7 flex justify-center">
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

        {paymentStub ? (
          <div
            className="mb-8 space-y-4 rounded-2xl border border-border bg-muted/30 p-6 text-center shadow-sm"
            role="status"
          >
            <p className="text-base font-semibold text-foreground">{t('paymentStubTitle')}</p>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">{t('paymentStubBody')}</p>
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-center">
              <Button type="button" variant="secondary" size="sm" onClick={() => setPaymentStub(false)}>
                {t('paymentStubClose')}
              </Button>
              <Button
                type="button"
                size="sm"
                className={`font-semibold ${onboardingGradientCta}`}
                onClick={() => {
                  setPaymentStub(false)
                  onContinueWithoutPayment()
                }}
              >
                {t('paymentStubContinue')}
              </Button>
            </div>
          </div>
        ) : null}

        {externalCheckout ? (
          <div className="mx-auto mb-4 max-w-md space-y-5 rounded-2xl border border-violet-500/35 bg-gradient-to-b from-violet-600/[0.08] to-card p-6 shadow-md">
            <h3 className="text-center text-lg font-semibold tracking-tight text-foreground">{tCheckout('title')}</h3>
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
                className={`h-11 w-full font-semibold ${onboardingGradientCta}`}
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
        ) : null}

        {!externalCheckout ? (
          <div className="flex flex-col gap-5 xl:grid xl:grid-cols-4 xl:items-stretch xl:gap-7">
            {free ? (
              <div className={cn(planCardBase, 'border-dashed border-border/80 bg-muted/[0.08] hover:bg-card')}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">{t('plans.free.title')}</h3>
                  <div className="shrink-0 text-end" dir="ltr">
                    <span className="block text-2xl font-bold tabular-nums tracking-tight text-foreground">
                      {money(0)}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] font-medium text-muted-foreground">
                      {t('freePriceCaption')}
                    </span>
                  </div>
                </div>
                <p className="text-sm leading-snug text-muted-foreground">{t('plans.free.tagline')}</p>
                <div className="flex-1">
                  <PlanBulletList items={freeBullets} />
                </div>
                <PlanBestFor label={t('bestForLabel')} text={t('plans.free.bestFor')} />
                <Button
                  type="button"
                  className={`mt-1 h-11 w-full font-semibold ${onboardingGradientCta}`}
                  disabled={pending}
                  onClick={onFree}
                >
                  {t('plans.free.cta')}
                </Button>
              </div>
            ) : null}

            {solo ? (
              <div className={planCardBase}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">{t('plans.solo.title')}</h3>
                  {priceBlock(solo.price_monthly, solo.price_yearly)}
                </div>
                <p className="text-sm leading-snug text-muted-foreground">{t('plans.solo.tagline')}</p>
                <div className="flex-1">
                  <PlanBulletList items={soloBullets} />
                </div>
                <PlanBestFor label={t('bestForLabel')} text={t('plans.solo.bestFor')} />
                <Button
                  type="button"
                  className={`mt-1 h-11 w-full font-semibold ${onboardingGradientCta}`}
                  disabled={pending}
                  onClick={() => onPaid('solo')}
                >
                  {t('plans.solo.cta')}
                </Button>
              </div>
            ) : null}

            {studio ? (
              <div className={cn(planCardBase, planCardFeatured)}>
                <div className="pointer-events-none absolute -top-3 inset-x-0 flex justify-center px-2">
                  <Badge
                    variant="default"
                    className="pointer-events-auto border-0 bg-gradient-to-l from-teal-600 to-violet-600 text-white shadow-md ring-2 ring-background"
                  >
                    {t('popularBadge')}
                  </Badge>
                </div>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">{t('plans.studio.title')}</h3>
                  {priceBlock(studio.price_monthly, studio.price_yearly)}
                </div>
                <p className="text-sm leading-snug text-muted-foreground">{t('plans.studio.tagline')}</p>
                <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">{t('growthPickLine')}</p>
                <div className="flex-1">
                  <PlanBulletList items={studioBullets} />
                </div>
                <PlanBestFor label={t('bestForLabel')} text={t('plans.studio.bestFor')} />
                <Button
                  type="button"
                  className={`mt-1 h-11 w-full font-semibold ${onboardingGradientCta}`}
                  disabled={pending}
                  onClick={() => onPaid('studio')}
                >
                  {t('plans.studio.cta')}
                </Button>
              </div>
            ) : null}

            {center ? (
              <div className={planCardBase}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">{t('plans.center.title')}</h3>
                  {priceBlock(center.price_monthly, center.price_yearly)}
                </div>
                <p className="text-sm leading-snug text-muted-foreground">{t('plans.center.tagline')}</p>
                <div className="flex-1">
                  <PlanBulletList items={centerBullets} />
                </div>
                <PlanBestFor label={t('bestForLabel')} text={t('plans.center.bestFor')} />
                <Button
                  type="button"
                  className={`mt-1 h-11 w-full font-semibold ${onboardingGradientCta}`}
                  disabled={pending}
                  onClick={() => onPaid('center')}
                >
                  {t('plans.center.cta')}
                </Button>
              </div>
            ) : null}

            {custom ? (
              <div
                className={cn(
                  'flex min-w-0 flex-col gap-5 rounded-2xl border-2 border-dashed border-violet-400/35 bg-gradient-to-br from-muted/30 via-card to-card px-6 py-6 shadow-sm sm:px-8 sm:py-7 xl:col-span-4 xl:flex-row xl:items-stretch xl:gap-10'
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/15 to-violet-600/20 text-teal-600 ring-1 ring-violet-500/20 dark:text-teal-300">
                      <Building2 className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-xl font-semibold tracking-tight text-foreground">{t('plans.custom.title')}</h3>
                      <p className="text-sm leading-snug text-muted-foreground">{t('plans.custom.tagline')}</p>
                    </div>
                  </div>
                  <div className="flex-1">
                    <PlanBulletList items={customBullets} />
                  </div>
                  <PlanBestFor label={t('bestForLabel')} text={t('plans.custom.bestFor')} />
                </div>
                <div className="flex w-full min-w-0 flex-col justify-end gap-2 border-t border-border/50 pt-5 xl:w-[min(100%,20rem)] xl:shrink-0 xl:justify-center xl:border-t-0 xl:border-s xl:ps-10 xl:pt-0">
                  {!customOpen ? (
                    <Button
                      type="button"
                      size="lg"
                      className={`h-11 w-full font-semibold ${onboardingGradientCta}`}
                      onClick={() => setCustomOpen(true)}
                    >
                      {t('plans.custom.cta')}
                    </Button>
                  ) : (
                    <form onSubmit={onCustomSubmit} className="space-y-2.5 rounded-xl border border-border/80 bg-card/60 p-4 shadow-inner">
                      <div className="space-y-1.5">
                        <Label htmlFor="saas-contact-name">{t('contactName')}</Label>
                        <Input
                          id="saas-contact-name"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          required
                          maxLength={200}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="saas-phone">{t('phone')}</Label>
                        <Input
                          id="saas-phone"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                          maxLength={30}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="saas-msg">{t('message')}</Label>
                        <Input
                          id="saas-msg"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          maxLength={2000}
                          className="h-9"
                        />
                      </div>
                      <Button
                        type="submit"
                        className={`h-11 w-full font-semibold ${onboardingGradientCta}`}
                        disabled={pending}
                      >
                        {t('submitInquiry')}
                      </Button>
                    </form>
                  )}
                  {!customOpen ? (
                    <p className="text-center text-xs text-muted-foreground">{t('plans.custom.ctaOpen')}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mx-auto mt-12 max-w-3xl" aria-labelledby="plan-faq-heading">
        <h2 id="plan-faq-heading" className="mb-4 text-center text-lg font-semibold text-foreground sm:text-start">
          {t('faqTitle')}
        </h2>
        <div className="space-y-2">
          {faqItems.map((item, idx) => (
            <details
              key={idx}
              className="group rounded-xl border border-border/80 bg-card/60 px-4 shadow-sm open:shadow-md"
            >
              <summary className="flex cursor-pointer list-none items-start gap-2 py-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  className="mt-0.5 size-4 shrink-0 text-violet-600 transition-transform duration-200 group-open:rotate-180 dark:text-violet-400"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-start">{item.q}</span>
              </summary>
              <p className="border-t border-border/60 pb-3 pt-2 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-10 flex justify-start border-t border-border/60 pt-6">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (externalCheckout) {
              setExternalCheckout(null)
              return
            }
            if (paymentStub) {
              setPaymentStub(false)
              return
            }
            onBack()
          }}
          disabled={pending}
        >
          {externalCheckout ? tCheckout('cancel') : paymentStub ? t('paymentStubClose') : t('back')}
        </Button>
      </div>
    </div>
  )
}
