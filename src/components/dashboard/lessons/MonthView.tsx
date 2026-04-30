import { getLocale } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import type { Lesson } from '@/lib/lessons/types'
import { MonthViewClient, type MonthViewClientProps } from './MonthViewClient'

export type MonthCalendarPayload = Omit<MonthViewClientProps, 'pickDayEnabled' | 'onPickDay'>

interface Holiday {
  date: string
  name: string
}

interface MonthCell {
  dateStr: string
  isCurrentMonth: boolean
}

export async function buildMonthCalendarPayload(input: {
  cells: MonthCell[]
  lessons: Lesson[]
  holidays: Holiday[]
  timezone: string
  todayStr: string
  monthStr: string
  weekStr: string
  scheduleBasePath?: string
  teacherId?: string
  studentId?: string
}): Promise<MonthCalendarPayload> {
  const {
    cells,
    lessons,
    holidays,
    timezone,
    todayStr,
    monthStr,
    weekStr,
    scheduleBasePath,
    teacherId,
    studentId,
  } = input
  const locale = await getLocale()
  const appLocale = parseAppLocale(locale)
  const intlLocale = toIntlLocale(appLocale)

  const dayHeaders = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2021, 0, 3 + i))
    return d.toLocaleDateString(intlLocale, { weekday: 'short' })
  })

  return {
    cells,
    lessons,
    holidays,
    timezone,
    todayStr,
    monthStr,
    weekStr,
    scheduleBasePath,
    teacherId,
    studentId,
    dayHeaders,
    appLocale,
  }
}

interface MonthViewProps {
  cells: MonthCell[]
  lessons: Lesson[]
  holidays: Holiday[]
  timezone: string
  todayStr: string
  monthStr: string
  weekStr: string
  teacherId?: string
  studentId?: string
}

export async function MonthView({
  cells,
  lessons,
  holidays,
  timezone,
  todayStr,
  monthStr,
  weekStr,
  teacherId,
  studentId,
}: MonthViewProps) {
  const payload = await buildMonthCalendarPayload({
    cells,
    lessons,
    holidays,
    timezone,
    todayStr,
    monthStr,
    weekStr,
    teacherId,
    studentId,
  })
  return <MonthViewClient {...payload} />
}
