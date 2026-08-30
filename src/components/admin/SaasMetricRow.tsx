import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { SaasMetrics } from '@/lib/superadmin/metrics'
import { cn } from '@/lib/utils'

/**
 * Lessio's own revenue numbers.
 *
 * Per /docs/sprint-34-scope.md § /admin block 1. The grid this replaces showed
 * tenant lesson counts and a sum over `charges` — money a teacher billed a
 * parent — under the heading "revenue".
 */
export async function SaasMetricRow({ metrics }: { metrics: SaasMetrics }) {
  const t = await getTranslations('admin.overview')
  const locale = await getLocale()
  const money = (n: number) => formatMoney(Math.round(n), locale)
  const pct = (v: number | null) =>
    v == null ? '—' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`

  const net = metrics.netNewMrrThisMonth
  const NetIcon = net > 0 ? ArrowUpRight : net < 0 ? ArrowDownRight : Minus

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* MRR carries the sub-line because it is the number the page exists for. */}
      <div className="rounded-xl border border-border bg-background p-5">
        <p className="text-xs font-medium text-muted-foreground">{t('mrr')}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{money(metrics.mrr)}</p>
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-xs tabular-nums',
            net > 0 ? 'text-emerald-600' : net < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          <NetIcon size={12} />
          {money(Math.abs(net))} {t('netThisMonth')}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <p className="text-xs font-medium text-muted-foreground">{t('arr')}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{money(metrics.arr)}</p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {t('payingOrgs', { count: metrics.payingOrgs })} · {money(metrics.arpa)}{' '}
          {t('arpaSuffix')}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <p className="text-xs font-medium text-muted-foreground">{t('activeTrials')}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{metrics.activeTrials}</p>
        <p
          className={cn(
            'mt-1 text-xs tabular-nums',
            metrics.trialsEndingWithin7Days > 0 ? 'text-amber-600' : 'text-muted-foreground'
          )}
        >
          {t('endingSoon', { count: metrics.trialsEndingWithin7Days })}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <p className="text-xs font-medium text-muted-foreground">{t('trialConversion')}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {pct(metrics.trialConversionRate)}
        </p>
        {/* The sample size is shown because at this stage it is often 1 or 2,
            and a "50% conversion" built on two tenants must not read as a trend. */}
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {t('ofTrials', { count: metrics.trialConversionSample })} ·{' '}
          {t('churn')} {pct(metrics.customerChurnRate)}
        </p>
      </div>
    </div>
  )
}
