import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, GraduationCap, CheckCircle2, Clock, Plus } from 'lucide-react'
import { getTranslations, getLocale } from 'next-intl/server'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeacherByProfileId } from '@/lib/teachers'
import {
  getLessonsForRange,
  getCurrentDayStr,
  formatTime,
} from '@/lib/lessons'
import { getTeacherDashboardStats } from '@/lib/dashboard/teacherStats'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Button } from '@/components/ui/button'
import { parseAppLocale } from '@/lib/i18n/locale'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export default async function TeacherDashboardPage() {
  const { userId, orgId, role } = await getSession()

  if (role !== 'teacher') {
    redirect('/dashboard')
  }

  const [timezone, locale, t, tc] = await Promise.all([
    getOrgTimezone(orgId),
    getLocale(),
    getTranslations('teacherSelf.dashboard'),
    getTranslations('common'),
  ])

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return (
      <div className="text-center mt-16 text-sm text-muted-foreground">
        {t('noTeacherRecordContact')}
      </div>
    )
  }

  const appLocale = parseAppLocale(locale)
  const dt = DateTime.now().setZone(timezone)
  const weekdayKey = WEEKDAY_KEYS[dt.weekday - 1]
  const todayLabel =
    locale === 'he'
      ? tc('todayLabel', {
          day: tc(`days.${weekdayKey}`),
          dayNum: dt.day,
          month: tc(`months.${dt.month}`),
        })
      : dt.setLocale('en').toFormat('cccc, LLLL d')

  const todayStr = getCurrentDayStr(timezone)

  const [stats, todayLessons] = await Promise.all([
    getTeacherDashboardStats(orgId, teacher.id, timezone),
    getLessonsForRange(orgId, timezone, todayStr, todayStr, teacher.id),
  ])

  return (
    <div className="flex flex-col">
      <LiveRefresh tables={['lessons']} />
      <PageHeader title={t('title')} subtitle={todayLabel} />

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label={t('kpi.lessonsToday')}
          value={stats.lessonsToday}
          icon={CalendarDays}
          variant="lessons"
        />
        <KpiCard
          label={t('kpi.lessonsThisWeek')}
          value={stats.lessonsThisWeek}
          icon={Clock}
          variant="default"
        />
        <KpiCard
          label={t('kpi.completedThisMonth')}
          value={stats.completedThisMonth}
          icon={CheckCircle2}
          variant="revenue"
        />
        <KpiCard
          label={t('kpi.activeStudents')}
          value={stats.activeStudents}
          icon={GraduationCap}
          variant="students"
        />
      </section>

      {/* Quick actions */}
      <div className="flex gap-3 mb-8">
        <Button asChild size="sm">
          <Link href="/teacher/new-lesson">
            <Plus size={14} className="me-1.5" />
            {t('actions.newLesson')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/teacher/schedule">
            <CalendarDays size={14} className="me-1.5" />
            {t('actions.viewSchedule')}
          </Link>
        </Button>
      </div>

      {/* Today's lessons */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          {t('todayLessons')}
        </p>

        {todayLessons.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={tc('emptyStates.noLessonsToday')}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[500px] w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-5 py-3 text-end text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {tc('table.time')}
                    </th>
                    <th className="px-5 py-3 text-end text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {tc('table.student')}
                    </th>
                    <th className="px-5 py-3 text-end text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {tc('table.status')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {todayLessons.map((lesson) => (
                    <tr key={lesson.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-5 py-3.5 font-mono text-sm text-muted-foreground" dir="ltr">
                        {formatTime(lesson.start_at, timezone, appLocale)}–{formatTime(lesson.end_at, timezone, appLocale)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/teacher/schedule/${lesson.id}`}
                          className="group flex items-center gap-2.5"
                        >
                          <UserAvatar name={lesson.student.full_name} />
                          <span className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                            {lesson.student.full_name}
                          </span>
                        </Link>
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
