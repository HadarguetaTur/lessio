import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CalendarDays, Plus, Receipt, TrendingUp } from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
    <div className="flex flex-col">
      <LiveRefresh tables={['lessons', 'charges', 'leads']} />
      <PageHeader
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

      {/* Today band: lessons (2/3) + needs-attention (1/3) */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodayLessonsList lessons={lessons} timezone={timezone} appLocale={appLocale} />
        </div>
        <AttentionPanel data={attention} timezone={timezone} appLocale={appLocale} />
      </div>

      {/* Business strip */}
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t('business.title')}</h2>
      <section className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t('kpi.monthlyRevenue')}
          value={formatCurrency(summary.monthlyRevenue, locale)}
          subLabel={t('kpi.monthToDate')}
          icon={TrendingUp}
          variant="revenue"
          trend={summary.deltas.revenue}
          href="/reports/revenue"
        />
        <KpiCard
          label={t('kpi.monthlyBilling')}
          value={formatCurrency(summary.monthlyBillingTotal, locale)}
          subLabel={t('kpi.monthlyBillingPaid', {
            amount: formatCurrency(summary.monthlyBillingPaid, locale),
          })}
          icon={Receipt}
          variant="default"
          href="/billing"
        />
        <KpiCard
          label={t('kpi.pendingDebt')}
          value={formatCurrency(summary.pendingDebt, locale)}
          subLabel={t('kpi.allTime')}
          icon={AlertCircle}
          variant={summary.pendingDebt > 0 ? 'debt' : 'default'}
          href="/billing/debts"
        />
        <KpiCard
          label={t('kpi.lessonsThisMonth')}
          value={summary.lessonsThisMonth}
          subLabel={
            summary.cancellation.elapsed > 0
              ? t('kpi.cancellationSub', { rate: summary.cancellation.rate })
              : undefined
          }
          icon={CalendarDays}
          variant={summary.cancellation.rate >= 20 ? 'warning' : 'lessons'}
          trend={summary.deltas.lessons}
          href="/reports/lessons"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              <Link href="/reports/revenue" className="transition-colors hover:text-primary">
                {t('revenueTrend.title')}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MiniRevenueChart data={trendData} locale={locale} />
          </CardContent>
        </Card>
        <ForecastCard forecast={forecast} locale={locale} />
      </section>
    </div>
  )
}
