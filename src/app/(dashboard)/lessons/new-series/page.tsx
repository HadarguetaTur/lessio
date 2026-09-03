import { redirect } from 'next/navigation'
import { DateTime } from 'luxon'
import { CalendarClock } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { getGroups } from '@/lib/groups'
import { getLessonSeriesList } from '@/lib/lessons/getSeries'
import { getOrgTimezone } from '@/lib/organizations'
import { getOrgHolidays, calendarHolidaysFrom } from '@/lib/organizations/holidays'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { NewSeriesForm } from '@/components/dashboard/lessons/NewSeriesForm'
import { SeriesRowActions } from '@/components/dashboard/lessons/SeriesRowActions'
import { EndedSeriesToggle } from '@/components/dashboard/lessons/EndedSeriesToggle'
import { ENDED_SERIES_ON } from '@/components/dashboard/lessons/seriesParams'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { getTranslations, getLocale } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'
import { updateSeriesUntilAction, stopSeriesAction, deleteSeriesAction } from './actions'
import { getOrgLessonDurations } from '@/lib/organizations/lessonDurations'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export default async function NewSeriesPage(props: {
  searchParams: Promise<{ ended?: string }>
}) {
  const { ended } = await props.searchParams
  const showEnded = ended === ENDED_SERIES_ON
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    redirect('/lessons')
  }

  const [teachers, students, groups, series, timezone, holidays, pricing, durations] = await Promise.all([
    getTeachers(orgId),
    getStudents(orgId),
    getGroups(orgId, { status: 'active' }),
    getLessonSeriesList(orgId),
    getOrgTimezone(orgId),
    getOrgHolidays(orgId, { from: calendarHolidaysFrom() }),
    getOrgPricing(orgId),
    getOrgLessonDurations(orgId, 'admin'),
  ])

  const activeTeachers = teachers
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, full_name: t.profile.full_name }))

  const activeStudents = students
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, full_name: s.full_name }))

  const t = await getTranslations('lessons')
  const tCommon = await getTranslations('common')
  const locale = parseAppLocale(await getLocale())
  const dateFormatter = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const todayStr = DateTime.now().setZone(timezone).toISODate()!

  // A series with nothing ahead of it is done — stopped, removed down to nothing,
  // or simply run out. Listing those alongside live ones buries the live ones,
  // and an org that has been running a while accumulates far more of them.
  const endedCount = series.filter((s) => s.upcomingCount === 0).length
  const visibleSeries = showEnded ? series : series.filter((s) => s.upcomingCount > 0)

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('newSeriesTitle')}</h1>
        <NewSeriesForm
          teachers={activeTeachers}
          students={activeStudents}
          timezone={timezone}
          appLocale={locale}
          holidays={holidays.map((h) => ({ date: h.date, name: h.name }))}
          groups={groups}
          pairPriceDefault={pricing.pairPricePerStudent}
          groupPriceDefault={pricing.groupPricePerStudent}
          durationValues={durations.map((item) => item.minutes)}
        />
      </div>

      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 xl:mt-11">
          <h2 className="text-lg font-semibold text-gray-900">{t('series.existingTitle')}</h2>
          <EndedSeriesToggle hiddenCount={endedCount} active={showEnded} />
        </div>
        {visibleSeries.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={endedCount > 0 ? t('series.allEnded') : t('series.existingEmpty')}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[
                      t('series.colSchedule'),
                      t('series.colStudents'),
                      t('series.colTeacher'),
                      t('series.colUpcoming'),
                      t('until'),
                      '',
                    ].map((label, i) => (
                      <th
                        key={i}
                        className="px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleSeries.map((s) => (
                    <tr key={s.id} className={s.stoppedAt ? 'text-muted-foreground' : undefined}>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-foreground">
                        <span className="font-semibold">
                          {tCommon(`days.${DAY_KEYS[s.rule.day_of_week]}`)}
                        </span>
                        <span className="mx-1.5 text-muted-foreground">·</span>
                        <span dir="ltr" className="font-medium tabular-nums">
                          {s.rule.start_time}
                        </span>
                        <span className="ms-1.5 text-xs text-muted-foreground">
                          ({s.rule.duration_minutes} {t('minutesSuffix')})
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-foreground">
                        {s.groupName ? (
                          <>
                            <span className="font-medium">{s.groupName}</span>
                            {s.studentNames.length > 0 && (
                              <span className="block text-xs text-muted-foreground">
                                {s.studentNames.join(', ')}
                              </span>
                            )}
                          </>
                        ) : (
                          s.studentNames.join(', ') || '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-muted-foreground">
                        {s.teacherName}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            s.upcomingCount > 0
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {t('series.upcomingCount', { count: s.upcomingCount })}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-muted-foreground">
                        {dateFormatter.format(new Date(`${s.rule.until}T00:00:00`))}
                        {s.stoppedAt && (
                          <Badge variant="secondary" className="ms-2">
                            {t('series.stoppedBadge')}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-end">
                        <SeriesRowActions
                          seriesId={s.id}
                          currentUntil={s.rule.until}
                          defaultStopDate={todayStr}
                          canDelete={s.canDelete}
                          historyCount={s.historyCount}
                          deletableCount={s.deletableCount}
                          updateUntilAction={updateSeriesUntilAction}
                          stopAction={stopSeriesAction}
                          deleteAction={deleteSeriesAction}
                        />
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
