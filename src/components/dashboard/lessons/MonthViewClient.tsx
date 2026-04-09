'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { formatTime } from '@/lib/lessons/format'
import type { Lesson, LessonStatus } from '@/lib/lessons/types'
import type { AppLocale } from '@/lib/i18n/locale'
import { cn } from '@/lib/utils'

const STATUS_DOT: Record<LessonStatus, string> = {
  scheduled: 'bg-primary',
  completed: 'bg-emerald-500',
  cancelled: 'bg-muted-foreground',
  no_show: 'bg-amber-500',
}

const STATUS_CHIP: Record<LessonStatus, string> = {
  scheduled: 'bg-primary/10 text-primary',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-muted text-muted-foreground line-through',
  no_show: 'bg-amber-50 text-amber-700',
}

interface Holiday {
  date: string
  name: string
}

interface MonthCell {
  dateStr: string
  isCurrentMonth: boolean
}

export interface MonthViewClientProps {
  cells: MonthCell[]
  lessons: Lesson[]
  holidays: Holiday[]
  timezone: string
  todayStr: string
  monthStr: string
  weekStr: string
  teacherId?: string
  studentId?: string
  dayHeaders: string[]
  appLocale: AppLocale
  pickDayEnabled?: boolean
  onPickDay?: (dateStr: string) => void
}

export function MonthViewClient({
  cells,
  lessons,
  holidays,
  timezone,
  todayStr,
  monthStr,
  weekStr,
  teacherId,
  studentId,
  dayHeaders,
  appLocale,
  pickDayEnabled,
  onPickDay,
}: MonthViewClientProps) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const holidayDates = new Map(holidays.map((h) => [h.date, h.name]))

  const byDay = new Map<string, Lesson[]>()
  lessons.forEach((l) => {
    const localDate = new Date(l.start_at).toLocaleDateString('sv-SE', { timeZone: timezone })
    if (!byDay.has(localDate)) byDay.set(localDate, [])
    byDay.get(localDate)!.push(l)
  })

  const [year, month] = monthStr.split('-').map(Number)
  const currentMonthPrefix = `${year}-${String(month).padStart(2, '0')}`

  const teacherQs = teacherId ? `&teacher=${teacherId}` : ''
  const studentQs = studentId ? `&student=${encodeURIComponent(studentId)}` : ''

  function lessonHref(lessonId: string) {
    return `/lessons/${lessonId}?week=${weekStr}${teacherQs}${studentQs}`
  }

  return (
    <div>
      <div className="w-full min-w-0">
        <div className="grid grid-cols-7 mb-1 min-w-0">
          {dayHeaders.map((label, i) => (
            <div
              key={i}
              className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1 sm:py-1.5 truncate px-0.5"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border min-w-0">
          {cells.map(({ dateStr, isCurrentMonth }) => {
            const dayLessons = byDay.get(dateStr) ?? []
            const isToday = dateStr === todayStr
            const dayNum = new Date(`${dateStr}T12:00:00Z`).getUTCDate()
            const holiday = holidayDates.get(dateStr)
            const isThisMonth = dateStr.startsWith(currentMonthPrefix)

            const dayLink = (
              <span
                className={cn(
                  'text-xs font-semibold min-w-7 min-h-7 inline-flex items-center justify-center rounded-full',
                  isToday
                    ? 'bg-primary text-primary-foreground'
                    : isCurrentMonth && isThisMonth
                      ? 'text-foreground'
                      : 'text-muted-foreground/50'
                )}
              >
                {dayNum}
              </span>
            )

            return (
              <div
                key={dateStr}
                className={cn(
                  'min-h-[72px] sm:min-h-[90px] p-1 sm:p-1.5 flex flex-col gap-0.5 sm:gap-1 min-w-0',
                  isToday
                    ? 'bg-primary/5'
                    : isCurrentMonth && isThisMonth
                      ? 'bg-card'
                      : 'bg-muted/30'
                )}
              >
                <div className="flex items-start justify-between gap-0.5 min-w-0">
                  {pickDayEnabled && onPickDay ? (
                    <button
                      type="button"
                      onClick={() => onPickDay(dateStr)}
                      className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={String(dayNum)}
                    >
                      {dayLink}
                    </button>
                  ) : (
                    <span className="shrink-0">{dayLink}</span>
                  )}
                  {holiday && (
                    <span className="text-[8px] sm:text-[9px] text-purple-600 truncate max-w-[min(100%,4.5rem)] sm:max-w-[60px] leading-tight text-start">
                      {holiday}
                    </span>
                  )}
                </div>

                {/* Compact: dots + count on very small screens */}
                <div className="sm:hidden flex flex-wrap items-center gap-0.5 min-h-[14px]">
                  {dayLessons.slice(0, 5).map((lesson) => (
                    <span
                      key={lesson.id}
                      className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[lesson.status])}
                      title={`${lesson.student.full_name} — ${formatTime(lesson.start_at, timezone, appLocale)}`}
                    />
                  ))}
                  {dayLessons.length > 5 && (
                    <span className="text-[9px] text-muted-foreground">+{dayLessons.length - 5}</span>
                  )}
                </div>

                <div className="hidden sm:flex flex-col gap-1 min-w-0">
                  {dayLessons.slice(0, 3).map((lesson) => (
                    <Link
                      key={lesson.id}
                      href={lessonHref(lesson.id)}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded truncate leading-tight',
                        STATUS_CHIP[lesson.status],
                        'hover:opacity-75 transition-opacity'
                      )}
                      title={`${lesson.student.full_name} — ${formatTime(lesson.start_at, timezone, appLocale)}`}
                    >
                      <span dir="ltr" className="font-mono">
                        {formatTime(lesson.start_at, timezone, appLocale)}
                      </span>{' '}
                      <span>{lesson.student.full_name}</span>
                    </Link>
                  ))}
                </div>

                {dayLessons.length > 3 && (
                  <Link
                    href={`/lessons?view=day&date=${dateStr}${teacherId ? `&teacher=${teacherId}` : ''}${studentId ? `&student=${encodeURIComponent(studentId)}` : ''}`}
                    className="text-[9px] sm:text-[10px] text-muted-foreground hover:text-foreground transition-colors truncate"
                  >
                    {t('moreCount', { count: dayLessons.length - 3 })}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground flex-wrap">
        {(['scheduled', 'completed', 'no_show', 'cancelled'] as LessonStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full inline-block', STATUS_DOT[s])} />
            {tCommon(`status.${s}`)}
          </span>
        ))}
      </div>
    </div>
  )
}
