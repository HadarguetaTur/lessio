import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { applyPaymentCallbackQuery } from '@/app/(onboarding)/onboarding/saas-actions'
import { PaymentCallbackPoll } from './PaymentCallbackPoll'
import { onboardingPanelCard, onboardingPanelPadding } from '@/components/onboarding/onboardingVisual'

export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    mock?: string
    failed?: string
    Valid?: string
    Identifier?: string
    ID?: string
  }>
}) {
  const sp = await searchParams
  const t = await getTranslations('onboarding.paymentCallback')

  const result = await applyPaymentCallbackQuery({
    mock: sp.mock ?? null,
    failed: sp.failed ?? null,
    valid: sp.Valid ?? null,
    identifier: sp.Identifier ?? null,
    id: sp.ID ?? null,
  })

  if (result === 'dashboard') {
    redirect('/dashboard')
  }

  if (result === 'failed') {
    return (
      <div
        className={`mx-auto max-w-md space-y-4 py-4 text-center sm:py-8 ${onboardingPanelCard} ${onboardingPanelPadding}`}
      >
        <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {t('failedTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('failedBody')}</p>
        <Link
          href="/onboarding"
          className="inline-flex text-sm font-semibold text-violet-600 underline-offset-4 hover:underline dark:text-violet-400"
        >
          {t('backToOnboarding')}
        </Link>
      </div>
    )
  }

  return <PaymentCallbackPoll />
}
