import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { formatMoney } from '@/lib/i18n/formatCurrency'

/**
 * Twelve months of collected platform revenue.
 *
 * Plain CSS bars rather than a charting library: twelve values do not justify
 * shipping one, and this way the panel renders on the server with no client
 * bundle at all.
 */
export async function MrrHistoryChart({
  months,
}: {
  months: { month: string; collected: number }[]
}) {
  const t = await getTranslations('admin.revenue')
  const locale = await getLocale()
  const max = Math.max(...months.map((m) => m.collected), 1)
  const hasAny = months.some((m) => m.collected > 0)

  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <h2 className="text-sm font-semibold">{t('collectedHistory')}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{t('collectedHistoryHint')}</p>

      {!hasAny ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('noHistory')}</p>
      ) : (
        <div className="flex h-40 items-end gap-1.5" role="img" aria-label={t('collectedHistory')}>
          {months.map((m) => {
            const dt = DateTime.fromFormat(m.month, 'yyyy-MM').setLocale(locale)
            const pct = (m.collected / max) * 100
            return (
              <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {m.collected > 0 ? formatMoney(Math.round(m.collected), locale) : ''}
                </span>
                <div
                  className="w-full rounded-t bg-indigo-500/80"
                  // A month with income must never render as a zero-height sliver.
                  style={{ height: `${m.collected > 0 ? Math.max(pct, 3) : 0}%` }}
                  title={`${dt.toFormat('LLLL yyyy')}: ${formatMoney(Math.round(m.collected), locale)}`}
                />
                <span className="truncate text-[10px] text-muted-foreground">
                  {dt.toFormat('LLL')}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
