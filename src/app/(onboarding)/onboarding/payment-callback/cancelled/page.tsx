import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { applyPaymentCallbackQuery } from '@/app/(onboarding)/onboarding/saas-actions'
import { parseCheckoutReturnQuery } from '@/lib/saas/checkoutReturn'
import { onboardingPanelCard, onboardingPanelPadding } from '@/components/onboarding/onboardingVisual'

/**
 * Sumit's CancelRedirectURL during onboarding. Nothing was charged; the pending
 * checkout is reverted so the org keeps the trial it was on.
 */
export default async function OnboardingCheckoutCancelledPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const t = await getTranslations('onboarding.paymentCallback')

  await applyPaymentCallbackQuery(parseCheckoutReturnQuery(sp, { cancelled: true }))

  return (
    <div
      className={`mx-auto max-w-md space-y-4 py-4 text-center sm:py-8 ${onboardingPanelCard} ${onboardingPanelPadding}`}
    >
      <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {t('cancelledTitle')}
      </h1>
      <p className="text-sm text-muted-foreground">{t('cancelledBody')}</p>
      <Link
        href="/onboarding"
        className="inline-flex text-sm font-semibold text-violet-600 underline-offset-4 hover:underline dark:text-violet-400"
      >
        {t('backToOnboarding')}
      </Link>
    </div>
  )
}
