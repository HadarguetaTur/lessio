import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { applyAccountBillingPaymentCallbackQuery } from '@/app/(dashboard)/account/billing/upgrade-actions'
import { parseCheckoutReturnQuery } from '@/lib/saas/checkoutReturn'

/**
 * Sumit's CancelRedirectURL. A separate path rather than `?cancelled=1` on the
 * success route: Sumit appends its own OG-* params, and a path cannot be
 * confused by how they merge into an existing query string.
 *
 * Nothing was charged, so the pending checkout is reverted and the org goes
 * back to the plan and status it held before.
 */
export default async function AccountBillingCheckoutCancelledPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const t = await getTranslations('saas.accountBilling.paymentCallback')

  await applyAccountBillingPaymentCallbackQuery(parseCheckoutReturnQuery(sp, { cancelled: true }))

  return (
    <div className="mx-auto max-w-md space-y-4 py-8 px-4 text-center">
      <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {t('cancelledTitle')}
      </h1>
      <p className="text-sm text-muted-foreground">{t('cancelledBody')}</p>
      <Link
        href="/account/billing"
        className="inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {t('backToBilling')}
      </Link>
    </div>
  )
}
