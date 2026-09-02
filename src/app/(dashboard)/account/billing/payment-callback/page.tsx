import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { applyAccountBillingPaymentCallbackQuery } from '@/app/(dashboard)/account/billing/upgrade-actions'
import { parseCheckoutReturnQuery } from '@/lib/saas/checkoutReturn'
import { BillingUpgradeCallbackPoll } from './BillingUpgradeCallbackPoll'

/**
 * Where Sumit sends the customer after a successful payment. It appends
 * OG-PaymentID / OG-CustomerID / OG-ExternalIdentifier; none of it is trusted —
 * the payment is looked up server-to-server before anything is activated.
 */
export default async function AccountBillingPaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const t = await getTranslations('saas.accountBilling.paymentCallback')

  const mock = typeof sp.mock === 'string' ? sp.mock : null
  const result = await applyAccountBillingPaymentCallbackQuery({
    ...parseCheckoutReturnQuery(sp),
    mock,
  })

  if (result === 'billing') {
    redirect('/account/billing')
  }

  if (result === 'failed' || result === 'refused' || result === 'cancelled') {
    const copy =
      result === 'cancelled'
        ? { title: t('cancelledTitle'), body: t('cancelledBody') }
        : result === 'refused'
          ? { title: t('refusedTitle'), body: t('refusedBody') }
          : { title: t('failedTitle'), body: t('failedBody') }

    return (
      <div className="mx-auto max-w-md space-y-4 py-8 px-4 text-center">
        <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {copy.title}
        </h1>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
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
