'use client'

/**
 * AI usage dashboard tab — Sprint 25 Story 2b.
 * Monthly summary cards + daily bar chart.
 */

import { useTranslations } from 'next-intl'
import type { UsageSummary } from '@/lib/ai-assistant/usage'

interface Props {
  summary: UsageSummary
  month: string
}

export function AiUsageTab({ summary, month }: Props) {
  const t = useTranslations('settings.aiUsage')

  const satisfactionTotal = summary.positiveCount + summary.negativeCount
  const satisfactionPct = satisfactionTotal > 0
    ? Math.round((summary.positiveCount / satisfactionTotal) * 100)
    : null

  const maxRequests = Math.max(...summary.dailyData.map(d => d.requests), 1)

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-900">
        {t('title')} — {month}
      </h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label={t('totalRequests')} value={String(summary.totalRequests)} />
        <SummaryCard
          label={t('totalTokens')}
          value={formatNumber(summary.totalPromptTokens + summary.totalCompletionTokens)}
        />
        <SummaryCard
          label={t('estimatedCost')}
          value={`$${summary.totalCostUsd.toFixed(4)}`}
        />
        <SummaryCard
          label={t('satisfaction')}
          value={satisfactionPct !== null ? `${satisfactionPct}%` : '—'}
          subtitle={satisfactionTotal > 0 ? `${summary.positiveCount}👍 / ${summary.negativeCount}👎` : undefined}
        />
      </div>

      {/* Daily bar chart */}
      {summary.dailyData.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">{t('dailyRequests')}</h3>
          <div className="flex items-end gap-1 h-32">
            {summary.dailyData.map((day) => {
              const height = Math.max((day.requests / maxRequests) * 100, 4)
              const dayNum = day.date.split('-')[2]
              return (
                <div key={day.date} className="flex flex-col items-center flex-1 min-w-0">
                  <div
                    className="w-full bg-blue-500 rounded-t-sm"
                    style={{ height: `${height}%` }}
                    title={`${day.date}: ${day.requests} ${t('requests')}`}
                  />
                  <span className="text-[10px] text-muted-foreground mt-1">{dayNum}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('noData')}</p>
      )}
    </div>
  )
}

function SummaryCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
