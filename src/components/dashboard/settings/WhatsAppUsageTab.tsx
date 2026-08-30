'use client'

/**
 * WhatsApp bot usage & operating cost tab.
 *
 * Cost is deliberately shown in USD, unconverted: Meta bills the WABA in
 * dollars, so any FX conversion here would stop matching the invoice the owner
 * can pull from WhatsApp Manager — the opposite of the transparency this tab
 * exists for.
 */

import { useTranslations } from 'next-intl'
import { DateTime } from 'luxon'
import { AlertCircle } from 'lucide-react'
import { PRICING_CATEGORIES, type PricingCategory, type WhatsAppUsageSummary, type UsageDays } from '@/lib/whatsapp/usageAnalytics'

interface Props {
  summary: WhatsAppUsageSummary
  days: UsageDays
}

const PERIODS: UsageDays[] = [30, 60, 90]

const CATEGORY_BAR: Record<PricingCategory, string> = {
  marketing: 'bg-amber-500',
  utility: 'bg-blue-500',
  service: 'bg-emerald-500',
  authentication: 'bg-violet-500',
  unknown: 'bg-gray-400',
}

export function WhatsAppUsageTab({ summary, days }: Props) {
  const t = useTranslations('settings.whatsappUsage')

  const maxDailyVolume = Math.max(...summary.daily.map(d => d.volume), 1)
  const maxCategoryVolume = Math.max(...PRICING_CATEGORIES.map(c => summary.byCategory[c].volume), 1)
  const visibleCategories = PRICING_CATEGORIES.filter(c => summary.byCategory[c].volume > 0)
  const hasData = summary.totalMessages > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* Period selector — plain links so the server re-renders with new data */}
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <a
            key={p}
            href={`?tab=usage&days=${p}`}
            aria-current={p === days ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              p === days
                ? 'bg-blue-600 text-white'
                : 'border border-gray-200 text-muted-foreground hover:text-gray-700'
            }`}
          >
            {t(`period${p}` as 'period30' | 'period60' | 'period90')}
          </a>
        ))}
      </div>

      {summary.stale && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{t('stale')}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label={t('totalMessages')} value={formatNumber(summary.totalMessages)} />
        <SummaryCard label={t('billableMessages')} value={formatNumber(summary.billableMessages)} />
        <SummaryCard label={t('freeMessages')} value={formatNumber(summary.freeMessages)} />
        <SummaryCard label={t('totalCost')} value={formatCost(summary.totalCostUsd)} />
      </div>

      <p className="text-xs text-muted-foreground">{t('costHint')}</p>

      {hasData ? (
        <>
          {/* Category breakdown */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">{t('byCategory')}</h3>
            <ul className="space-y-3">
              {visibleCategories.map(category => {
                const { volume, costUsd } = summary.byCategory[category]
                return (
                  <li key={category}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-900">{t(`categories.${category}`)}</span>
                      <span className="text-muted-foreground">
                        {formatNumber(volume)} {t('messagesUnit')} · {formatCost(costUsd)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                      <div
                        className={`h-2 rounded-full ${CATEGORY_BAR[category]}`}
                        style={{ width: `${Math.max((volume / maxCategoryVolume) * 100, 2)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t(`categoryHints.${category}`)}</p>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Daily stacked bars */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">{t('dailyVolume')}</h3>
            <div className="flex items-end gap-px h-32">
              {summary.daily.map((day, i) => {
                const height = Math.max((day.volume / maxDailyVolume) * 100, 4)
                const showLabel = i % 7 === 0
                return (
                  <div key={day.date} className="flex flex-col items-center flex-1 min-w-0">
                    <div
                      className="flex w-full flex-col-reverse justify-end overflow-hidden rounded-t-sm"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${day.volume} ${t('messagesUnit')} · ${formatCost(day.costUsd)}`}
                    >
                      {PRICING_CATEGORIES.filter(c => (day.byCategory[c]?.volume ?? 0) > 0).map(c => (
                        <div
                          key={c}
                          className={CATEGORY_BAR[c]}
                          style={{ height: `${((day.byCategory[c]?.volume ?? 0) / day.volume) * 100}%` }}
                        />
                      ))}
                    </div>
                    <span className="mt-1 h-3 text-[10px] text-muted-foreground">
                      {showLabel ? day.date.slice(8) : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('noData')}</p>
      )}

      <p className="text-xs text-muted-foreground">
        {t('lastUpdated', { time: formatTimestamp(summary.fetchedAt) })}
      </p>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Sub-dollar totals need more decimals to read as anything but zero. */
function formatCost(usd: number): string {
  if (usd === 0) return '$0'
  return usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

function formatTimestamp(iso: string): string {
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.toFormat('dd/MM HH:mm') : '—'
}
