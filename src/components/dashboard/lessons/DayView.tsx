import Link from 'next/link'
import { Repeat, Clock } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'
import type { Lesson, LessonStatus } from '@/lib/lessons'
import { formatTime } from '@/lib/lessons'

const STATUS_STYLES: Record<LessonStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled: 'bg-muted text-muted-foreground border border-border line-through',
  no_show: 'bg-amber-50 text-amber-700 border border-amber-200',
}

interface Holiday {
  date: string
  name: string
}

function lessonListQuery(weekStr: string, teacherId?: string, studentId?: string): string {
  let q = `week=${encodeURIComponent(weekStr)}`
  if (teacherId) q += `&teacher=${encodeURIComponent(teacherId)}`
  if (studentId) q += `&student=${encodeURIComponent(studentId)}`
  return q
}

interface DayViewProps {
  dateStr: string
  lessons: Lesson[]
  holidays: Holiday[]
  timezone: string
  weekStr: string
  scheduleBasePath?: string
  teacherId?: string
  studentId?: string
}

export async function DayView({
  dateStr,
  lessons,
  holidays,
  timezone,
  weekStr,
  scheduleBasePath = '/lessons',
  teacherId,
  studentId,
}: DayViewProps) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations('lessons'),
    getTranslations('common'),
    getLocale(),
  ])
  const appLocale = parseAppLocale(locale)

  const STATUS_LABELS: Record<LessonStatus, string> = {
    scheduled: tCommon('status.scheduled'),
    completed: tCommon('status.completed'),
    cancelled: tCommon('status.cancelled'),
    no_show: tCommon('status.no_show'),
  }

  const holiday = holidays.find((h) => h.date === dateStr)

  if (lessons.length === 0 && !holiday) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <Clock size={40} className="mb-3 opacity-30" />
        <p className="text-sm font-medium">{t('noLessonsDay')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 max-w-2xl">
      {holiday && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-50 border border-purple-100 text-purple-700 text-sm">
          <span className="font-medium">{holiday.name}</span>
          <span className="text-purple-400">— {t('holidayLabel')}</span>
        </div>
      )}

      {lessons.map((lesson) => {
        const startTime = formatTime(lesson.start_at, timezone, appLocale)
        const endTime = formatTime(lesson.end_at, timezone, appLocale)
        const durationMin = Math.round(
          (new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / 60000
        )

        const lessonHref =
          scheduleBasePath === '/teacher/schedule'
            ? `/teacher/schedule/${lesson.id}?week=${encodeURIComponent(weekStr)}`
            : `/lessons/${lesson.id}?${lessonListQuery(weekStr, teacherId, studentId)}`

        return (
          <Link
            key={lesson.id}
            href={lessonHref}
            className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-opacity hover:opacity-80 ${STATUS_STYLES[lesson.status]}`}
          >
            <div className="text-center min-w-[56px]">
              <p dir="ltr" className="font-mono text-sm font-bold">{startTime}</p>
              <p dir="ltr" className="font-mono text-xs">{endTime}</p>
            </div>

            <div className="w-px self-stretch bg-current opacity-20" />

            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{lesson.student.full_name}</p>
              <p className="text-xs truncate">{lesson.teacher.full_name}</p>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs font-medium">{STATUS_LABELS[lesson.status]}</span>
              <span className="text-xs">{durationMin} {t('minutesSuffix')}</span>
            </div>

            {lesson.series_id && (
              <Repeat size={14} className="shrink-0 opacity-50" />
            )}
          </Link>
        )
      })}

      <p className="text-xs text-muted-foreground pt-1">
        {t('lessonsCount', { count: lessons.length })}
      </p>
    </div>
  )
}
