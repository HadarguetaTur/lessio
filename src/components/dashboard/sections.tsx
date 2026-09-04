import Link from 'next/link'
import { AlertCircle, TrendingUp } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import type { AppLocale } from '@/lib/i18n/locale'
import { getTodayLessons } from '@/lib/lessons'
import { getDashboardSummary } from '@/lib/dashboard/stats'
import { getAttentionData } from '@/lib/dashboard/attention'
import type { AttentionActionResult } from '@/app/(dashboard)/dashboard/actions'
import { getMonthlyRevenueTrend } from '@/lib/reports/revenue'
import { getMonthForecast } from '@/lib/reports/forecast'
import { getOrgSetupProgress } from '@/lib/organizations/readiness'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { SetupChecklistCard } from '@/components/dashboard/SetupChecklistCard'
import { TodayLessonsList } from '@/components/dashboard/TodayLessonsList'
import { AttentionPanel } from '@/components/dashboard/AttentionPanel'
import { ForecastCard } from '@/components/dashboard/ForecastCard'
import { MiniRevenueChart } from '@/components/dashboard/MiniRevenueChart'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

/**
 * "Finish setting up" — owner only, and only while something is missing.
 *
 * UX audit 5 (F5) found the old readiness strip tracked 3 of 16 surfaces; the
 * dashboard rebuild then removed it entirely, leaving no answer to "did I
 * finish setting up?". This band answers it from real product data
 * (getOrgSetupProgress) and removes itself the day the studio is operational.
 * The AI assistant is deliberately not on the list: the platform key usually
 * covers it, and it is optional in a way payments and WhatsApp are not.
 */
export async function SetupSection({ orgId }: { orgId: string }) {
  const [progress, t] = await Promise.all([
    getOrgSetupProgress(orgId),
    getTranslations('dashboard'),
  ])

  const items = [
    { key: 'teacher', done: progress.hasTeacher, href: '/teachers' },
    { key: 'student', done: progress.hasStudent, href: '/students' },
    { key: 'lesson', done: progress.hasLesson, href: '/lessons/new' },
    { key: 'whatsapp', done: progress.hasWhatsApp, href: '/settings/whatsapp' },
    { key: 'payment', done: progress.hasPayment, href: '/settings/payment' },
  ].map((item) => ({ ...item, label: t(`setup.items.${item.key}`) }))

  const doneCount = items.filter((i) => i.done).length
  if (doneCount === items.length) return null

  return (
    <SetupChecklistCard
      title={t('setup.title')}
      progressLabel={t('setup.progress', { done: doneCount, total: items.length })}
      dismissLabel={t('setup.dismiss')}
      orgId={orgId}
      items={items}
    />
  )
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
  completeLessonAction,
  markHomeworkDoneAction,
}: SectionProps & {
  leadsEnabled: boolean
  completeLessonAction: (id: string) => Promise<AttentionActionResult>
  markHomeworkDoneAction: (id: string) => Promise<AttentionActionResult>
}) {
  // A brand-new org has nothing needing attention because it has nothing at
  // all. "Everything is handled" is true of the queue and false of the
  // business, and the audit caught it saying so one click after the onboarding
  // wizard had already claimed the org was ready.
  const [attention, { count: studentCount }] = await Promise.all([
    getAttentionData(orgId, timezone, { leadsEnabled }),
    createServiceRoleClient()
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
  ])
  return (
    <AttentionPanel
      data={attention}
      timezone={timezone}
      appLocale={appLocale}
      hasStudents={(studentCount ?? 0) > 0}
      completeLessonAction={completeLessonAction}
      markHomeworkDoneAction={markHomeworkDoneAction}
    />
  )
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
