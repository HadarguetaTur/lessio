import Link from 'next/link'
import { AlertCircle, TrendingUp } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import type { AppLocale } from '@/lib/i18n/locale'
import { getTodayLessons } from '@/lib/lessons'
import { getDashboardSummary } from '@/lib/dashboard/stats'
import { getAttentionData } from '@/lib/dashboard/attention'
import { getMonthlyRevenueTrend } from '@/lib/reports/revenue'
import { getMonthForecast } from '@/lib/reports/forecast'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { TodayLessonsList } from '@/components/dashboard/TodayLessonsList'
import { AttentionPanel } from '@/components/dashboard/AttentionPanel'
import { ForecastCard } from '@/components/dashboard/ForecastCard'
import { MiniRevenueChart } from '@/components/dashboard/MiniRevenueChart'
import { SetupStrip, type SetupGap } from '@/components/dashboard/SetupStrip'
import { getOrgReadiness } from '@/lib/organizations/readiness'

/**
 * Each band fetches its own data so it can stream independently.
 *
 * The dashboard used to await all five queries before painting anything, so
 * today's lessons — the reason the app gets opened between lessons — waited on
 * twelve months of revenue aggregation.
 */

interface SectionProps {
  orgId: string
  timezone: string
  appLocale: AppLocale
  locale: string
}

export async function TodaySection({ orgId, timezone, appLocale }: SectionProps) {
  const lessons = await getTodayLessons(orgId, timezone)
  return <TodayLessonsList lessons={lessons} timezone={timezone} appLocale={appLocale} />
}

export async function AttentionSection({
  orgId,
  timezone,
  appLocale,
  leadsEnabled,
}: SectionProps & { leadsEnabled: boolean }) {
  const attention = await getAttentionData(orgId, timezone, { leadsEnabled })
  return <AttentionPanel data={attention} timezone={timezone} appLocale={appLocale} />
}

export async function MoneySection({ orgId, timezone, locale }: SectionProps) {
  const [summary, t] = await Promise.all([
    getDashboardSummary(orgId, timezone),
    getTranslations('dashboard'),
  ])

  return (
    <section aria-label={t('business.title')}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-base font-semibold text-foreground">{t('business.title')}</h2>
        <Link
          href="/reports/lessons"
          className="text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          {t('business.subtitle', {
            lessons: summary.lessonsThisMonth,
            rate: summary.cancellation.rate,
          })}
        </Link>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
        <KpiCard
          label={t('kpi.monthlyRevenue')}
          value={formatCurrency(summary.monthlyRevenue, locale)}
          subLabel={t('kpi.monthToDate')}
          icon={TrendingUp}
          variant="revenue"
          size="lg"
          trend={summary.deltas.revenue}
          href="/reports/revenue"
        />
        <KpiCard
          label={t('kpi.pendingDebt')}
          value={formatCurrency(summary.pendingDebt, locale)}
          subLabel={
            summary.debtorCount > 0
              ? t('kpi.debtorsSub', { count: summary.debtorCount })
              : t('kpi.noDebt')
          }
          icon={AlertCircle}
          variant={summary.pendingDebt > 0 ? 'debt' : 'default'}
          size="lg"
          href="/billing/debts"
        />
      </div>
    </section>
  )
}

export async function OutlookSection({ orgId, timezone, appLocale, locale }: SectionProps) {
  const [forecast, trend, t] = await Promise.all([
    getMonthForecast(orgId, timezone),
    getMonthlyRevenueTrend(orgId, timezone, 12),
    getTranslations('dashboard'),
  ])

  // MiniRevenueChart is presentation-only — localize month labels here.
  const trendData = trend.map(({ month, amount }) => ({
    month: DateTime.fromFormat(month, 'yyyy-MM').setLocale(appLocale).toFormat('LLL yy'),
    amount,
  }))

  return (
    <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
      <ForecastCard forecast={forecast} locale={locale} />
      <div className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-card px-4 pt-4 pb-4 shadow-sm sm:px-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          <Link href="/reports/revenue" className="transition-colors hover:text-primary">
            {t('revenueTrend.title')}
          </Link>
        </h3>
        <MiniRevenueChart data={trendData} locale={locale} />
      </div>
    </section>
  )
}

/**
 * "You are not live yet", or nothing at all.
 *
 * Kept out of the dashboard's Promise.all and given its own Suspense boundary
 * with a null fallback, so this extra query never delays the LCP.
 */
export async function SetupSection({ orgId, appLocale }: { orgId: string; appLocale: AppLocale }) {
  const readiness = await getOrgReadiness(orgId)
  if (readiness.isReady) return null

  const missing: SetupGap[] = []
  if (!readiness.hasWhatsApp) missing.push('whatsapp')
  if (!readiness.hasAi) missing.push('ai')
  if (!readiness.hasPayment) missing.push('payment')

  return <SetupStrip orgId={orgId} missing={missing} isRtl={appLocale === 'he'} />
}
