import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { applyAccountBillingPaymentCallbackQuery } from '@/app/(dashboard)/account/billing/upgrade-actions'
import { BillingUpgradeCallbackPoll } from './BillingUpgradeCallbackPoll'

export default async function AccountBillingPaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ mock?: string; failed?: string }>
}) {
  const sp = await searchParams
  const t = await getTranslations('saas.accountBilling.paymentCallback')

  const result = await applyAccountBillingPaymentCallbackQuery({
    mock: sp.mock ?? null,
    failed: sp.failed ?? null,
  })

  if (result === 'billing') {
    redirect('/account/billing')
  }

  if (result === 'failed') {
    return (
      <div className="mx-auto max-w-md space-y-4 py-8 px-4 text-center">
        <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {t('failedTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('failedBody')}</p>
        <Link
          href="/account/billing"
          className="inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('backToBilling')}
        </Link>
      </div>
    )
  }

  return <BillingUpgradeCallbackPoll />
}
