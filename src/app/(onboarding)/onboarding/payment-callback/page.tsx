import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { applyPaymentCallbackQuery } from '@/app/(onboarding)/onboarding/saas-actions'
import { parseCheckoutReturnQuery } from '@/lib/saas/checkoutReturn'
import { PaymentCallbackPoll } from './PaymentCallbackPoll'
import { onboardingPanelCard, onboardingPanelPadding } from '@/components/onboarding/onboardingVisual'

/**
 * Sumit's RedirectURL for onboarding checkout. It appends OG-PaymentID /
 * OG-CustomerID / OG-ExternalIdentifier; the payment is verified against Sumit
 * before anything is activated.
 */
export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const t = await getTranslations('onboarding.paymentCallback')

  const mock = typeof sp.mock === 'string' ? sp.mock : null
  const result = await applyPaymentCallbackQuery({ ...parseCheckoutReturnQuery(sp), mock })

  if (result === 'dashboard') {
    redirect('/dashboard')
  }

  if (result === 'failed' || result === 'refused' || result === 'cancelled') {
    const copy =
      result === 'cancelled'
        ? { title: t('cancelledTitle'), body: t('cancelledBody') }
        : result === 'refused'
          ? { title: t('refusedTitle'), body: t('refusedBody') }
          : { title: t('failedTitle'), body: t('failedBody') }

    return (
      <div
        className={`mx-auto max-w-md space-y-4 py-4 text-center sm:py-8 ${onboardingPanelCard} ${onboardingPanelPadding}`}
      >
        <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {copy.title}
        </h1>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
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
