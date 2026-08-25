'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t('forecast.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="font-semibold">{t('forecast.total')}</span>
          <span className="text-lg font-bold">
            {formatCurrency(forecast.total, locale)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
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
      </CardContent>
    </Card>
  )
}
