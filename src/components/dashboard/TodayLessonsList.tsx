import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { filterCalendarLessons, formatTime, getLessonTitle, type Lesson } from '@/lib/lessons'
import { findNextLessonId } from '@/lib/lessons/nextLesson'
import type { AppLocale } from '@/lib/i18n/locale'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { cn } from '@/lib/utils'

interface TodayLessonsListProps {
  lessons: Lesson[]
  timezone: string
  appLocale: AppLocale
  limit?: number
}

/**
 * Today's lessons as compact link-rows: the operational heart of the dashboard,
 * so it runs the full width of the content column. Heading and the day's tally
 * live inside the card so the section reads as one block.
 * Caps at `limit` rows with a view-all link; highlights the next upcoming lesson.
 */
export async function TodayLessonsList({
  lessons,
  timezone,
  appLocale,
  limit = 8,
}: TodayLessonsListProps) {
  const [t, tc, tLessons] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('common'),
    getTranslations('lessons'),
  ])

  // The dashboard and calendar share this rule: upcoming cancellations remain
  // hidden until the person explicitly asks to see them.
  const { visible: scheduledLessons, hiddenCount } = filterCalendarLessons(lessons, {
    includeCancelled: false,
  })
  const total = scheduledLessons.length
  const completed = scheduledLessons.filter((l) => l.status === 'completed').length
  const cancelled = scheduledLessons.filter((l) => l.status === 'cancelled').length
  const nextLessonId = findNextLessonId(scheduledLessons, DateTime.utc().toISO()!)

  const visible = scheduledLessons.slice(0, limit)
  const visibleGroups = visible.reduce<Array<{ time: string; lessons: Lesson[] }>>((groups, lesson) => {
    const time = formatTime(lesson.start_at, timezone, appLocale)
    const last = groups.at(-1)
    if (last?.time === time) {
      last.lessons.push(lesson)
    } else {
      groups.push({ time, lessons: [lesson] })
    }
    return groups
  }, [])

  if (total === 0 && hiddenCount === 0) {
    return (
      <section aria-label={t('today.title')}>
        <h2 className="mb-3 text-base font-semibold text-foreground">{t('today.title')}</h2>
        <EmptyState
          icon={CalendarDays}
          title={tc('emptyStates.noLessonsToday')}
          className="py-12"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/lessons/new">{t('today.emptyAction')}</Link>
            </Button>
          }
        />
      </section>
    )
  }

  return (
    <section
      aria-label={t('today.title')}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-4 pb-2 sm:px-5">
        <h2 className="text-base font-semibold text-foreground">{t('today.title')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('today.summary', { total, completed, cancelled })}
        </p>
      </div>

      <ul className="px-2 pb-2 sm:px-3">
        {visibleGroups.map((group, groupIndex) => (
          <li key={group.time} className={cn(groupIndex > 0 && 'border-t border-border/70')}>
            <div className="flex gap-2 py-2 sm:gap-3">
              {/* A fixed time rail makes the day's rhythm scannable even when
                  several teachers begin at the same moment. */}
              <span dir="ltr" className="w-11 shrink-0 pt-1 font-mono text-xs font-semibold tabular-nums text-muted-foreground sm:w-16">
                {group.time}
              </span>
              <ul className="min-w-0 flex-1 space-y-1">
                {group.lessons.map((lesson) => {
                  const isNext = lesson.id === nextLessonId
                  const title = getLessonTitle(lesson, tLessons)
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/lessons/${lesson.id}`}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 sm:gap-4 sm:px-3',
                          isNext && 'bg-primary/5 hover:bg-primary/10'
                        )}
                      >
                        <span dir="ltr" className="hidden w-[4.25rem] shrink-0 text-start font-mono text-xs tabular-nums text-muted-foreground sm:block">
                          {formatTime(lesson.end_at, timezone, appLocale)}
                        </span>
                        <UserAvatar name={title} />
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <bdi className="min-w-0 truncate text-sm font-medium text-foreground">{title}</bdi>
                          {isNext && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                              {t('today.nextBadge')}
                            </span>
                          )}
                        </span>
                        <bdi className="truncate text-xs text-muted-foreground sm:max-w-40">{lesson.teacher.full_name}</bdi>
                        <StatusBadge status={lesson.status} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <Link
          href="/lessons?view=day&cancelled=1"
          className="block border-t border-border/70 px-4 py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {t('today.hiddenCancelled', { count: hiddenCount })}
        </Link>
      )}

      {total > limit && (
        <Link
          href="/lessons?view=day"
          className="block border-t border-border/70 px-4 py-2.5 text-center text-xs font-medium text-primary transition-colors hover:bg-muted/40"
        >
          {t('today.viewAll', { count: total })}
        </Link>
      )}
    </section>
  )
}
