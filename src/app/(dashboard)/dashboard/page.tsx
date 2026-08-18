import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, GraduationCap, UserPlus, XCircle, TriangleAlert, TrendingUp, AlertCircle } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations, getLocale } from 'next-intl/server'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTodayLessons, formatTime, LessonStatus, Lesson } from '@/lib/lessons'
import { getDashboardStats } from '@/lib/dashboard/stats'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function countByStatus(lessons: Lesson[], status: LessonStatus) {
  return lessons.filter((l) => l.status === status).length
}

export default async function DashboardPage() {
  const { orgId, role } = await getSession()

  if (role === 'teacher') {
    redirect('/teacher/dashboard')
  }

  const [timezone, locale, t, tc] = await Promise.all([
    getOrgTimezone(orgId),
    getLocale(),
    getTranslations('dashboard'),
    getTranslations('common'),
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

  const [lessons, stats] = await Promise.all([
    getTodayLessons(orgId, timezone),
    getDashboardStats(orgId, timezone),
  ])

  const total = lessons.length
  const scheduled = countByStatus(lessons, 'scheduled')
  const completed = countByStatus(lessons, 'completed')
  const noShow = countByStatus(lessons, 'no_show')
  const cancelled = countByStatus(lessons, 'cancelled')

  const statusCounters = [
    { label: t('statusCounters.total'),     value: total,     color: 'text-foreground' },
    { label: t('statusCounters.scheduled'), value: scheduled, color: 'text-primary' },
    { label: t('statusCounters.completed'), value: completed, color: 'text-emerald-600' },
    { label: t('statusCounters.noShow'),    value: noShow,    color: 'text-amber-600' },
    { label: t('statusCounters.cancelled'), value: cancelled, color: 'text-red-500' },
  ]

  return (
    <div className="flex flex-col">
      <PageHeader title={t('title')} subtitle={todayLabel} />

      {/* Primary KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <KpiCard
          label={t('kpi.monthlyRevenue')}
          value={formatCurrency(stats.monthlyRevenue, locale)}
          icon={TrendingUp}
          variant="revenue"
        />
        <KpiCard
          label={t('kpi.monthlyBilling')}
          value={formatCurrency(stats.monthlyBillingTotal, locale)}
          subLabel={t('kpi.monthlyBillingPaid', {
            amount: formatCurrency(stats.monthlyBillingPaid, locale),
          })}
          icon={TrendingUp}
          variant={stats.monthlyBillingOpen > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label={t('kpi.pendingDebt')}
          value={formatCurrency(stats.pendingDebt, locale)}
          icon={AlertCircle}
          variant={stats.pendingDebt > 0 ? 'debt' : 'default'}
          highlight={stats.pendingDebt > 0}
        />
        <KpiCard
          label={t('kpi.lessonsThisMonth')}
          value={stats.lessonsThisMonth}
          icon={CalendarDays}
          variant="lessons"
        />
        <KpiCard
          label={t('kpi.activeStudents')}
          value={stats.activeStudents}
          icon={GraduationCap}
          variant="students"
        />
      </section>

      {/* Secondary KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label={t('kpi.cancellationRate')}
          value={`${stats.cancellationRateThisMonth}%`}
          icon={XCircle}
          highlight={stats.cancellationRateThisMonth >= 20}
          variant={stats.cancellationRateThisMonth >= 20 ? 'warning' : 'default'}
        />
        <KpiCard
          label={t('kpi.atRiskStudents')}
          value={stats.atRiskStudents}
          icon={TriangleAlert}
          highlight={stats.atRiskStudents > 0}
          variant={stats.atRiskStudents > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label={t('kpi.newLeads')}
          value={stats.newLeadsThisMonth}
          icon={UserPlus}
          variant="default"
        />
      </section>

      {/* Today status row */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          {t('todayStatus')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {statusCounters.map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-card rounded-lg border border-border px-3 py-3 text-center"
            >
              <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Today's lessons */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          {t('todayLessons')}
        </p>
        {lessons.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={tc('emptyStates.noLessonsToday')}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[600px] w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-end text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tc('table.time')}
                    </th>
                    <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-end text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tc('table.student')}
                    </th>
                    <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-end text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tc('table.teacher')}
                    </th>
                    <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-end text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tc('table.status')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lessons.map((lesson) => (
                    <tr key={lesson.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-5 py-3.5 font-mono text-sm text-muted-foreground" dir="ltr">
                        {formatTime(lesson.start_at, timezone, appLocale)}–{formatTime(lesson.end_at, timezone, appLocale)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/lessons/${lesson.id}`}
                          className="group flex items-center gap-2.5"
                        >
                          <UserAvatar name={lesson.student.full_name} />
                          <span className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                            {lesson.student.full_name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={lesson.teacher.full_name} />
                          <span className="text-sm text-muted-foreground">{lesson.teacher.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={lesson.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
