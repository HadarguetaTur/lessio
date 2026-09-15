import Link from 'next/link'
import { Repeat, Clock } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'
import type { Lesson, LessonStatus } from '@/lib/lessons'
import { formatTime, getLessonTitle } from '@/lib/lessons'
import { TEACHER_COLOR_CLASSES, resolveTeacherColor } from '@/lib/teachers/color'
import { cn } from '@/lib/utils'

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
  /** Several teachers: each row carries the teacher's colour stripe. */
  showTeacherStripe?: boolean
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
  showTeacherStripe = false,
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
  const timelineGroups = lessons.reduce<Array<{ time: string; lessons: Lesson[] }>>((groups, lesson) => {
    const time = formatTime(lesson.start_at, timezone, appLocale)
    const last = groups.at(-1)
    if (last?.time === time) last.lessons.push(lesson)
    else groups.push({ time, lessons: [lesson] })
    return groups
  }, [])

  if (lessons.length === 0 && !holiday) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <Clock size={40} className="mb-3 opacity-30" />
        <p className="text-sm font-medium">{t('noLessonsDay')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      {holiday && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-50 border border-purple-100 text-purple-700 text-sm">
          <span className="font-medium">{holiday.name}</span>
          <span className="text-purple-400">— {t('holidayLabel')}</span>
        </div>
      )}

      <ol className="relative space-y-3 before:absolute before:inset-y-2 before:start-[2.15rem] before:w-px before:bg-border sm:before:start-[3.15rem]">
        {timelineGroups.map((group) => (
          <li key={group.time} className="relative flex gap-3 sm:gap-4">
            <time dir="ltr" className="z-10 w-11 shrink-0 bg-background pt-3 text-center font-mono text-xs font-bold tabular-nums text-muted-foreground sm:w-16 sm:text-sm">
              {group.time}
            </time>
            <div className="min-w-0 flex-1 space-y-2">
              {group.lessons.map((lesson) => {
                const endTime = formatTime(lesson.end_at, timezone, appLocale)
                const durationMin = Math.round((new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / 60000)
                const lessonHref = scheduleBasePath === '/teacher/schedule'
                  ? `/teacher/schedule/${lesson.id}?week=${encodeURIComponent(weekStr)}`
                  : `/lessons/${lesson.id}?${lessonListQuery(weekStr, teacherId, studentId)}`

                return (
                  <Link key={lesson.id} href={lessonHref} className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-3 transition-opacity hover:opacity-80 sm:gap-4 sm:px-4',
                    STATUS_STYLES[lesson.status],
                    showTeacherStripe && 'border-s-4',
                    showTeacherStripe && TEACHER_COLOR_CLASSES[resolveTeacherColor(lesson.teacher)].stripe
                  )}>
                    <div className="text-center">
                      <p dir="ltr" className="font-mono text-xs font-semibold">{endTime}</p>
                      <p className="text-[10px]">{durationMin} {t('minutesSuffix')}</p>
                    </div>
                    <div className="w-px self-stretch bg-current opacity-20" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{getLessonTitle(lesson, t)}</p>
                      <p className="truncate text-xs">{lesson.teacher.full_name}</p>
                    </div>
                    <span className="hidden shrink-0 text-xs font-medium sm:block">{STATUS_LABELS[lesson.status]}</span>
                    {lesson.series_id && <Repeat size={14} className="shrink-0 opacity-50" />}
                  </Link>
                )
              })}
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground pt-1">
        {t('lessonsCount', { count: lessons.length })}
      </p>
    </div>
  )
}
