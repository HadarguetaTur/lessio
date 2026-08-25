'use client'

import { useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import type { MonthForecast } from '@/lib/reports/forecast'

interface ForecastCardProps {
  forecast: MonthForecast
  locale: string
}

export function ForecastCard({ forecast, locale }: ForecastCardProps) {
  const t = useTranslations('dashboard')
  const progressPct = forecast.total > 0
    ? Math.min(Math.round((forecast.actual / forecast.total) * 100), 100)
    : 0

  return (
    // Same shell as every other dashboard card: one radius, one border, one shadow.
    <section className="flex h-full flex-col rounded-xl border border-border bg-card px-4 pt-4 pb-4 shadow-sm sm:px-5">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{t('forecast.title')}</h3>

      <div className="flex flex-1 flex-col gap-3">
        {/* Actual */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('forecast.actual')}</span>
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            {formatCurrency(forecast.actual, locale)}
          </span>
        </div>

        {/* Projected */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('forecast.projected')}</span>
          <span className="text-muted-foreground">
            {formatCurrency(forecast.projected, locale)}
          </span>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold">{t('forecast.total')}</span>
          <span className="text-xl font-bold tracking-tight">
            {formatCurrency(forecast.total, locale)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* At-risk badge */}
        {forecast.atRisk > 0 && (
          <div className="flex justify-end">
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">
              {formatCurrency(forecast.atRisk, locale)} {t('forecast.atRisk')}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
