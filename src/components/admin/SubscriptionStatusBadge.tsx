import { getTranslations } from 'next-intl/server'

import type { SaasSubscriptionStatus } from '@/lib/saas/types'
import { cn } from '@/lib/utils'

/**
 * Subscription state as a chip.
 *
 * Colour encodes what it costs us, not what the enum is called: `past_due` is
 * money at risk today and reads as critical; `read_only` is a tenant already
 * lost and reads as muted.
 */
const STYLES: Record<SaasSubscriptionStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  trial: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  past_due: 'bg-destructive/10 text-destructive',
  pending_payment: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  cancelled: 'bg-muted text-muted-foreground',
  read_only: 'bg-muted text-muted-foreground',
}

export async function SubscriptionStatusBadge({
  status,
  cancelAtPeriodEnd,
}: {
  status: SaasSubscriptionStatus
  cancelAtPeriodEnd?: boolean
}) {
  const t = await getTranslations('admin.subscriptions.status')

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
          STYLES[status]
        )}
      >
        {t(status)}
      </span>
      {/* A subscription can be active and already on its way out. Hiding that
          behind the status chip is how a churn month becomes a surprise. */}
      {cancelAtPeriodEnd && status !== 'cancelled' && (
        <span className="whitespace-nowrap text-xs text-amber-600">{t('endingBadge')}</span>
      )}
    </span>
  )
}
