'use client'

import Link from 'next/link'
import { Repeat } from 'lucide-react'
import { formatTime } from '@/lib/lessons/format'
import type { Lesson, LessonStatus } from '@/lib/lessons/types'
import type { AppLocale } from '@/lib/i18n/locale'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<LessonStatus, string> = {
  scheduled: 'bg-primary/10 text-primary border border-primary/20',
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
  pickDayEnabled,
  onPickDay,
  legend,
}: WeekViewClientProps) {
  const holidayDates = new Set(holidays.map((h) => h.date))

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

    return (
      <div
        key={dateStr}
        role={pickable ? 'button' : undefined}
        tabIndex={pickable ? 0 : undefined}
        onClick={pickable ? () => onPickDay!(dateStr) : undefined}
        onKeyDown={
          pickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPickDay!(dateStr)
                }
              }
            : undefined
        }
        aria-label={pickable ? dateStr : undefined}
        className={cn(
          'rounded-lg border min-h-36 min-w-0 text-start',
          isToday ? 'border-primary/30 bg-primary/5' : 'border-border bg-card',
          pickable &&
            'cursor-pointer transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <div
          className={cn(
            'px-2 py-1.5 text-center border-b',
            isToday ? 'border-primary/20' : 'border-border'
          )}
        >
          {headerInner}
        </div>

        {holidayDates.has(dateStr) && (
          <div className="px-1.5 py-0.5 mx-1 mt-1 text-xs text-center text-purple-600 bg-purple-50 rounded border border-purple-100 truncate">
            {holidays.find((h) => h.date === dateStr)?.name}
          </div>
        )}

        <div className="p-1 space-y-1">
          {dayLessons.map((lesson) => (
            <Link
              key={lesson.id}
              href={lessonHref(lesson.id)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className={`block rounded px-1.5 py-1 text-xs leading-snug ${STATUS_STYLES[lesson.status]} hover:opacity-75 transition-opacity`}
            >
              <span className="flex items-center justify-between gap-1">
                <span dir="ltr" className="font-mono">
                  {formatTime(lesson.start_at, timezone, appLocale)}
                </span>
                {lesson.series_id && <Repeat size={10} className="shrink-0 opacity-70" />}
              </span>
              <span className="truncate block">{lesson.student.full_name}</span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile: stacked days */}
      <div className="flex flex-col gap-3 md:hidden">
        {weekDays.map((dateStr, i) => renderDayColumn(dateStr, i))}
      </div>

      {/* md+: 7-column week */}
      <div className="hidden md:grid md:grid-cols-7 md:gap-1.5 md:min-w-0">
        {weekDays.map((dateStr, i) => renderDayColumn(dateStr, i))}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-primary/10 border border-primary/20 inline-block" />
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
