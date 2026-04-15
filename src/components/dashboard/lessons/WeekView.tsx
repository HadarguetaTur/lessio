import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'
import type { Lesson } from '@/lib/lessons/types'
import { WeekViewClient, type WeekViewClientProps } from './WeekViewClient'

export type WeekCalendarPayload = Omit<WeekViewClientProps, 'pickDayEnabled' | 'onPickDay'>

interface Holiday {
  date: string
  name: string
}

export async function buildWeekCalendarPayload(input: {
  weekDays: string[]
  lessons: Lesson[]
  holidays: Holiday[]
  timezone: string
  todayStr: string
  weekStr: string
  scheduleBasePath?: string
  teacherId?: string
  studentId?: string
}): Promise<WeekCalendarPayload> {
  const {
    weekDays,
    lessons,
    holidays,
    timezone,
    todayStr,
    weekStr,
    scheduleBasePath,
    teacherId,
    studentId,
  } = input
  const [tCommon, locale] = await Promise.all([getTranslations('common'), getLocale()])
  const appLocale = parseAppLocale(locale)

  const dayNames = [
    tCommon('days.sun'),
    tCommon('days.mon'),
    tCommon('days.tue'),
    tCommon('days.wed'),
    tCommon('days.thu'),
    tCommon('days.fri'),
    tCommon('days.sat'),
  ]

  return {
    weekDays,
    lessons,
    holidays,
    timezone,
    todayStr,
    weekStr,
    scheduleBasePath,
    teacherId,
    studentId,
    dayNames,
    appLocale,
    legend: {
      scheduled: tCommon('status.scheduled'),
      completed: tCommon('status.completed'),
      noShow: tCommon('status.no_show'),
      cancelled: tCommon('status.cancelled'),
    },
  }
}

interface WeekViewProps {
  weekDays: string[]
  lessons: Lesson[]
  holidays: Holiday[]
  timezone: string
  todayStr: string
  weekStr: string
  teacherId?: string
  studentId?: string
}

/** Server calendar week (no day-pick; use LessonsScheduleSection for admin sheet). */
export async function WeekView({
  weekDays,
  lessons,
  holidays,
  timezone,
  todayStr,
  weekStr,
  teacherId,
  studentId,
}: WeekViewProps) {
  const payload = await buildWeekCalendarPayload({
    weekDays,
    lessons,
    holidays,
    timezone,
    todayStr,
    weekStr,
    teacherId,
    studentId,
  })
  return <WeekViewClient {...payload} />
}
