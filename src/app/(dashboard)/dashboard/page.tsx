import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, Plus, TrendingUp } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations, getLocale } from 'next-intl/server'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getSession } from '@/lib/auth/session'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { getOrgTimezone } from '@/lib/organizations'
import { getTodayLessons } from '@/lib/lessons'
import { getDashboardSummary } from '@/lib/dashboard/stats'
import { getAttentionData } from '@/lib/dashboard/attention'
import { getMonthlyRevenueTrend } from '@/lib/reports/revenue'
import { getMonthForecast } from '@/lib/reports/forecast'
import { getEffectiveSaasFeatures } from '@/lib/saas/subscriptions'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { TodayLessonsList } from '@/components/dashboard/TodayLessonsList'
import { AttentionPanel } from '@/components/dashboard/AttentionPanel'
import { ForecastCard } from '@/components/dashboard/ForecastCard'
import { MiniRevenueChart } from '@/components/dashboard/MiniRevenueChart'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export default async function DashboardPage() {
  const { orgId, role } = await getSession()

  if (role === 'teacher') {
    redirect('/teacher/dashboard')
  }

  const [timezone, locale, t, tc, saasFeatures] = await Promise.all([
    getOrgTimezone(orgId),
    getLocale(),
    getTranslations('dashboard'),
    getTranslations('common'),
    getEffectiveSaasFeatures(orgId),
  ])

  const appLocale = parseAppLocale(locale)
  const dt = DateTime.now().setZone(timezone)
  const weekdayKey = WEEKDAY_KEYS[dt.weekday - 1]
  const todayLabel = locale === 'he'
    ? tc('todayLabel', {
        day: tc(`days.${weekdayKey}`),
        dayNum: dt.day,
        month: tc(`months.${dt.month}`),
      })
    : dt.setLocale('en').toFormat('cccc, LLLL d')

  const [lessons, summary, attention, trend, forecast] = await Promise.all([
    getTodayLessons(orgId, timezone),
    getDashboardSummary(orgId, timezone),
    getAttentionData(orgId, timezone, { leadsEnabled: saasFeatures.leads }),
    getMonthlyRevenueTrend(orgId, timezone, 12),
    getMonthForecast(orgId, timezone),
  ])

  // MiniRevenueChart is presentation-only — localize month labels here.
  const trendData = trend.map(({ month, amount }) => ({
    month: DateTime.fromFormat(month, 'yyyy-MM').setLocale(appLocale).toFormat('LLL yy'),
    amount,
  }))

  return (
    // Command-centre order: today → what needs a decision → how the business is
    // doing. Every band is a direct child of this column, so they all align to
    // the same container edges. Gaps are the 8px scale (gap-6 = 24px).
    <div className="flex w-full flex-col gap-6">
      <LiveRefresh tables={['lessons', 'charges', 'leads']} />
      <PageHeader
        className="mb-0 gap-3 sm:mb-0"
        title={t('title')}
        subtitle={todayLabel}
        actions={
          <Button asChild size="sm">
            <Link href="/lessons/new">
              <Plus size={14} className="me-1.5" />
              {t('newLesson')}
            </Link>
          </Button>
        }
      />

      {/* 1 — Today, full width. */}
      <TodayLessonsList lessons={lessons} timezone={timezone} appLocale={appLocale} />

      {/* 2 — Needs attention, as a row of equal-height cards. */}
      <AttentionPanel data={attention} timezone={timezone} appLocale={appLocale} />

      {/* 3 — Business performance. Two numbers a tutor acts on: what came in,
          what is still owed. Lesson volume rides along in the heading rather
          than competing with money for a card. */}
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
              attention.debtors.count > 0
                ? t('kpi.debtorsSub', { count: attention.debtors.count })
                : t('kpi.noDebt')
            }
            icon={AlertCircle}
            variant={summary.pendingDebt > 0 ? 'debt' : 'default'}
            size="lg"
            href="/billing/debts"
          />
        </div>
      </section>

      {/* 4 — Forecast beside the 12-month trend. */}
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
    </div>
  )
}
