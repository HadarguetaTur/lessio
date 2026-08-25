import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { formatTime, type Lesson } from '@/lib/lessons'
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
 * Today's lessons as compact link-rows: the operational heart of the dashboard.
 * Caps at `limit` rows with a view-all link; highlights the next upcoming lesson.
 */
export async function TodayLessonsList({
  lessons,
  timezone,
  appLocale,
  limit = 8,
}: TodayLessonsListProps) {
  const [t, tc] = await Promise.all([getTranslations('dashboard'), getTranslations('common')])

  const total = lessons.length
  const completed = lessons.filter((l) => l.status === 'completed').length
  const cancelled = lessons.filter((l) => l.status === 'cancelled').length
  const nextLessonId = findNextLessonId(lessons, DateTime.utc().toISO()!)

  const visible = lessons.slice(0, limit)

  return (
    <section aria-label={t('today.title')}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t('today.title')}</h2>
        {total > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('today.summary', { total, completed, cancelled })}
          </p>
        )}
      </div>

      {total === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={tc('emptyStates.noLessonsToday')}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/lessons/new">{t('today.emptyAction')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {visible.map((lesson) => {
              const isNext = lesson.id === nextLessonId
              return (
                <li key={lesson.id}>
                  <Link
                    href={`/lessons/${lesson.id}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30',
                      isNext && 'border-s-2 border-primary bg-primary/5'
                    )}
                  >
                    <span
                      className="w-24 shrink-0 font-mono text-xs text-muted-foreground"
                      dir="ltr"
                    >
                      {formatTime(lesson.start_at, timezone, appLocale)}–
                      {formatTime(lesson.end_at, timezone, appLocale)}
                    </span>
                    <UserAvatar name={lesson.student.full_name} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {lesson.student.full_name}
                      {isNext && (
                        <span className="ms-2 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {t('today.nextBadge')}
                        </span>
                      )}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block sm:max-w-32">
                      {lesson.teacher.full_name}
                    </span>
                    <StatusBadge status={lesson.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
          {total > limit && (
            <Link
              href="/lessons"
              className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary transition-colors hover:bg-muted/30"
            >
              {t('today.viewAll', { count: total })}
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
