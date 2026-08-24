import { redirect } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { getLessonSeriesList } from '@/lib/lessons/getSeries'
import { NewSeriesForm } from '@/components/dashboard/lessons/NewSeriesForm'
import { EmptyState } from '@/components/ui/empty-state'
import { getTranslations, getLocale } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export default async function NewSeriesPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    redirect('/lessons')
  }

  const [teachers, students, series] = await Promise.all([
    getTeachers(orgId),
    getStudents(orgId),
    getLessonSeriesList(orgId),
  ])

  const activeTeachers = teachers
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, full_name: t.profile.full_name }))

  const activeStudents = students
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, full_name: s.full_name }))

  const t = await getTranslations('lessons')
  const locale = parseAppLocale(await getLocale())
  const dateFormatter = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('newSeriesTitle')}</h1>
        <NewSeriesForm teachers={activeTeachers} students={activeStudents} />
      </div>

      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 xl:mt-11">
          {t('series.existingTitle')}
        </h2>
        {series.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t('series.existingEmpty')} />
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
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {series.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-foreground">
                        {t(`days.${DAY_KEYS[s.rule.day_of_week]}`)} · {s.rule.start_time}
                        <span className="ms-1 text-xs text-muted-foreground">
                          ({s.rule.duration_minutes} {t('minutesSuffix')})
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-foreground">
                        {s.studentNames.join(', ') || '—'}
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
