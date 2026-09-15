'use client'

import Link from 'next/link'
import { Maximize2, Minimize2, Repeat } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatTime } from '@/lib/lessons/format'
import { getLessonTitle } from '@/lib/lessons/title'
import type { Lesson, LessonStatus } from '@/lib/lessons/types'
import type { AppLocale } from '@/lib/i18n/locale'
import { TEACHER_COLOR_CLASSES, resolveTeacherColor } from '@/lib/teachers/color'
import { cn } from '@/lib/utils'
import { CALENDAR_DENSITY_COMPACT, CALENDAR_DENSITY_PARAM } from './calendarParams'

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

export interface WeekViewClientProps {
  weekDays: string[]
  lessons: Lesson[]
  holidays: Holiday[]
  timezone: string
  todayStr: string
  weekStr: string
  /** `/lessons` (admin) or `/teacher/schedule` (self) — controls lesson detail links. */
  scheduleBasePath?: string
  teacherId?: string
  studentId?: string
  dayNames: string[]
  appLocale: AppLocale
  /** Status is the card background; with several teachers the teacher is its stripe. */
  showTeacherStripe?: boolean
  /** Name the teacher on the card (whole-centre view, no teacher filter). */
  showTeacherName?: boolean
  /** owner/admin: open schedule sheet for this local date */
  pickDayEnabled?: boolean
  onPickDay?: (dateStr: string) => void
  legend: {
    scheduled: string
    completed: string
    noShow: string
    cancelled: string
  }
}

export function WeekViewClient({
  weekDays,
  lessons,
  holidays,
  timezone,
  todayStr,
  weekStr,
  scheduleBasePath = '/lessons',
  teacherId,
  studentId,
  dayNames,
  appLocale,
  showTeacherStripe = false,
  showTeacherName = false,
  pickDayEnabled,
  onPickDay,
  legend,
}: WeekViewClientProps) {
  const t = useTranslations('lessons')
  const router = useRouter()
  const searchParams = useSearchParams()
  const isCompact = searchParams.get(CALENDAR_DENSITY_PARAM) === CALENDAR_DENSITY_COMPACT
  const holidayDates = new Set(holidays.map((h) => h.date))

  function toggleDensity() {
    const params = new URLSearchParams(searchParams.toString())
    if (isCompact) params.delete(CALENDAR_DENSITY_PARAM)
    else params.set(CALENDAR_DENSITY_PARAM, CALENDAR_DENSITY_COMPACT)
    const query = params.toString()
    router.replace(query ? `${scheduleBasePath}?${query}` : scheduleBasePath, { scroll: false })
  }

  const byDay = new Map<string, Lesson[]>()
  weekDays.forEach((d) => byDay.set(d, []))
  lessons.forEach((l) => {
    const localDate = new Date(l.start_at).toLocaleDateString('sv-SE', { timeZone: timezone })
    byDay.get(localDate)?.push(l)
  })

  const teacherQs = teacherId ? `&teacher=${teacherId}` : ''
  const studentQs = studentId ? `&student=${encodeURIComponent(studentId)}` : ''

  function lessonHref(lessonId: string) {
    if (scheduleBasePath === '/teacher/schedule') {
      return `/teacher/schedule/${lessonId}?week=${weekStr}`
    }
    return `/lessons/${lessonId}?week=${weekStr}${teacherQs}${studentQs}`
  }

  function dayHref(dateStr: string) {
    const params = new URLSearchParams({ view: 'day', date: dateStr })
    if (scheduleBasePath === '/lessons' && teacherId) params.set('teacher', teacherId)
    if (studentId) params.set('student', studentId)
    if (isCompact) params.set(CALENDAR_DENSITY_PARAM, CALENDAR_DENSITY_COMPACT)
    return `${scheduleBasePath}?${params.toString()}`
  }

  function renderDayColumn(dateStr: string, i: number) {
    const dayLessons = byDay.get(dateStr) ?? []
    const isToday = dateStr === todayStr
    const dayNum = new Date(`${dateStr}T12:00:00Z`).getUTCDate()

    const headerInner = (
      <>
        <p className="text-[10px] text-muted-foreground md:text-[10px]">{dayNames[i]}</p>
        <p className={cn('text-sm font-bold', isToday ? 'text-primary' : 'text-foreground')}>
          {dayNum}
        </p>
      </>
    )

    const pickable = Boolean(pickDayEnabled && onPickDay)

    const headerClass = cn(
      'px-2 text-center border-b',
      isCompact ? 'py-1' : 'py-1.5',
      isToday ? 'border-primary/20' : 'border-border'
    )

    return (
      <div
        key={dateStr}
        onClick={pickable ? () => onPickDay!(dateStr) : undefined}
        className={cn(
          'rounded-lg border min-w-0 text-start',
          isCompact ? 'min-h-28' : 'min-h-36',
          isToday ? 'border-primary/30 bg-primary/5' : 'border-border bg-card',
          pickable && 'cursor-pointer transition-colors hover:bg-muted/30'
        )}
      >
        {/* The column header carries the keyboard affordance. The column itself
            stays a plain div: role="button" around the lesson links would nest
            interactive elements and break tab order. */}
        {pickable ? (
          <button
            type="button"
            onClick={() => onPickDay!(dateStr)}
            aria-label={dateStr}
            className={cn(
              headerClass,
              'w-full cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {headerInner}
          </button>
        ) : (
          <Link
            href={dayHref(dateStr)}
            aria-label={`${dayNames[i]} ${dayNum}`}
            className={cn(
              headerClass,
              'block w-full transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {headerInner}
          </Link>
        )}

        {holidayDates.has(dateStr) && (
          <div className="px-1.5 py-0.5 mx-1 mt-1 text-xs text-center text-purple-600 bg-purple-50 rounded border border-purple-100 truncate">
            {holidays.find((h) => h.date === dateStr)?.name}
          </div>
        )}

        {/* A capped, independently scrollable day keeps a busy centre from
            stretching the whole weekly page. */}
        <div className={cn(
          'space-y-1 overflow-y-auto overscroll-contain p-1 scrollbar-thin',
          isCompact ? 'max-h-[20rem]' : 'max-h-[28rem]'
        )}>
          {dayLessons.map((lesson, lessonIndex) => {
            const title = getLessonTitle(lesson, t)
            const hour = formatTime(lesson.start_at, timezone, appLocale).slice(0, 2)
            const previousHour = lessonIndex > 0
              ? formatTime(dayLessons[lessonIndex - 1].start_at, timezone, appLocale).slice(0, 2)
              : null
            return (
              <div key={lesson.id}>
                {hour !== previousHour && (
                  <div className={cn('flex items-center gap-1.5 px-0.5 text-[10px] font-medium text-muted-foreground', isCompact ? 'pt-0.5' : 'pt-1')}>
                    <span dir="ltr" className="font-mono">{hour}:00</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <Link
                  href={lessonHref(lesson.id)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  title={showTeacherStripe ? `${title} — ${lesson.teacher.full_name}` : undefined}
                  className={cn(
                    'block rounded px-1.5 text-xs leading-snug hover:opacity-75 transition-opacity',
                    isCompact ? 'py-0.5' : 'py-1',
                    STATUS_STYLES[lesson.status],
                    showTeacherStripe && 'border-s-4',
                    showTeacherStripe && TEACHER_COLOR_CLASSES[resolveTeacherColor(lesson.teacher)].stripe
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span dir="ltr" className="font-mono">
                      {formatTime(lesson.start_at, timezone, appLocale)}
                    </span>
                    {lesson.series_id && <Repeat size={10} className="shrink-0 opacity-70" />}
                  </span>
                  <span className="truncate block">{title}</span>
                  {showTeacherName && (
                    <span className="truncate block text-[10px] opacity-75">
                      {lesson.teacher.full_name}
                    </span>
                  )}
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={toggleDensity}
          aria-label={isCompact ? 'Expand schedule' : 'Compact schedule'}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isCompact ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
        </button>
      </div>
      {/* One pass, laid out by CSS: stacked on mobile, seven columns from md.
          Rendering the week twice and hiding one copy put every lesson link in
          the DOM twice — duplicated for screen readers and tab order, and
          double the work on every render. */}
      <div className="flex flex-col gap-3 md:grid md:grid-cols-7 md:gap-1.5 md:min-w-0">
        {weekDays.map((dateStr, i) => renderDayColumn(dateStr, i))}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200 inline-block" />
          {legend.scheduled}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200 inline-block" />
          {legend.completed}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200 inline-block" />
          {legend.noShow}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-muted border border-border inline-block" />
          {legend.cancelled}
        </span>
      </div>
    </>
  )
}
