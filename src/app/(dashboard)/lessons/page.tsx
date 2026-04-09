import Link from 'next/link'
import { Repeat, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import {
  getLessonsForWeek,
  getLessonsForRange,
  getCurrentWeekSunday,
  getCurrentDayStr,
  getWeekDays,
  getMonthDays,
} from '@/lib/lessons'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { getGroups } from '@/lib/groups'
import { getOrgHolidays } from '@/lib/organizations/holidays'
import { WeekNav } from '@/components/dashboard/lessons/WeekNav'
import { DayNav } from '@/components/dashboard/lessons/DayNav'
import { MonthNav } from '@/components/dashboard/lessons/MonthNav'
import { ViewToggle } from '@/components/dashboard/lessons/ViewToggle'
import { CalendarTeacherSelect } from '@/components/dashboard/lessons/CalendarTeacherSelect'
import { buildWeekCalendarPayload } from '@/components/dashboard/lessons/WeekView'
import { buildMonthCalendarPayload } from '@/components/dashboard/lessons/MonthView'
import {
  LessonsScheduleSection,
  type ScheduleFormResources,
} from '@/components/dashboard/lessons/LessonsScheduleSection'
import { DayView } from '@/components/dashboard/lessons/DayView'
import { PageHeader } from '@/components/ui/page-header'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

type CalendarView = 'day' | 'week' | 'month'

export default async function LessonsPage(props: {
  searchParams: Promise<{
    view?: string
    week?: string
    date?: string
    month?: string
    teacher?: string
    student?: string
  }>
}) {
  const { view: viewParam, week, date, month, teacher, student: studentParam } =
    await props.searchParams
  const studentParsed = z.string().uuid().safeParse(studentParam)
  const studentFilter = studentParsed.success ? studentParsed.data : undefined
  const view: CalendarView =
    viewParam === 'day' || viewParam === 'month' ? viewParam : 'week'

  const { orgId, role } = await getSession()
  const t = await getTranslations('lessons')
  const tCommon = await getTranslations('common')

  const VIEW_TITLES: Record<CalendarView, string> = {
    day:   t('title'),
    week:  t('title'),
    month: t('title'),
  }
  const timezone = await getOrgTimezone(orgId)

  const todayStr = getCurrentDayStr(timezone)
  const currentWeekStr = getCurrentWeekSunday(timezone)
  const currentMonthStr = todayStr.substring(0, 7)

  const [teachers, holidays] = await Promise.all([
    getTeachers(orgId),
    getOrgHolidays(orgId),
  ])

  const activeTeachers = teachers
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, full_name: t.profile.full_name }))

  const isAdmin = role === 'owner' || role === 'admin'

  let scheduleForm: ScheduleFormResources | null = null
  if (isAdmin) {
    const [students, groups] = await Promise.all([getStudents(orgId), getGroups(orgId)])
    scheduleForm = {
      teachers: activeTeachers,
      students: students
        .filter((s) => s.is_active)
        .map((s) => ({ id: s.id, full_name: s.full_name })),
      groups,
    }
  }

  const headerActions = isAdmin ? (
    <div className="flex items-center gap-2">
      <Link href="/lessons/import">
        <Button variant="outline" size="sm">
          <Upload size={14} className="ml-1.5" />
          {tCommon('actions.import')}
        </Button>
      </Link>
      <Link href="/lessons/new-series">
        <Button variant="outline" size="sm">
          <Repeat size={14} className="ml-1.5" />
          {t('newSeries')}
        </Button>
      </Link>
      <Link href="/lessons/new">
        <Button size="sm">
          <Plus size={14} className="ml-1.5" />
          {t('newLesson')}
        </Button>
      </Link>
    </div>
  ) : undefined

  // ─── WEEK VIEW ─────────────────────────────────────────────────────────────
  if (view === 'week') {
    const weekStr = week ?? currentWeekStr
    const weekDays = getWeekDays(weekStr)
    const lessons = await getLessonsForWeek(orgId, timezone, weekStr, teacher, studentFilter)

    const weekCalendar = await buildWeekCalendarPayload({
      weekDays,
      lessons,
      holidays,
      timezone,
      todayStr,
      weekStr,
      teacherId: teacher,
      studentId: studentFilter,
    })

    return (
      <div>
        <PageHeader title={VIEW_TITLES.week} actions={headerActions} />
        <div className="mb-5 flex items-center gap-3 flex-wrap">
          <ViewToggle
            currentView="week"
            currentDate={todayStr}
            currentWeek={weekStr}
            currentMonth={currentMonthStr}
            teacherId={teacher}
          />
          <WeekNav
            weekStr={weekStr}
            teachers={activeTeachers}
            teacherId={teacher}
            currentWeekStr={currentWeekStr}
          />
        </div>
        <LessonsScheduleSection
          variant="week"
          todayStr={todayStr}
          calendar={weekCalendar}
          isAdmin={isAdmin}
          scheduleForm={scheduleForm}
          defaultTeacherId={teacher}
        />
      </div>
    )
  }

  // ─── DAY VIEW ──────────────────────────────────────────────────────────────
  if (view === 'day') {
    const dateStr = date ?? todayStr

    // Compute the Sunday of the week containing dateStr (for lesson back-links)
    const base = new Date(`${dateStr}T12:00:00Z`)
    const dow = base.getUTCDay()
    const sundayMs = base.getTime() - dow * 24 * 60 * 60 * 1000
    const weekStr = new Date(sundayMs).toISOString().substring(0, 10)

    const lessons = await getLessonsForRange(
      orgId,
      timezone,
      dateStr,
      dateStr,
      teacher,
      studentFilter
    )

    return (
      <div>
        <PageHeader title={VIEW_TITLES.day} actions={headerActions} />
        <div className="mb-5 flex items-center gap-3 flex-wrap">
          <ViewToggle
            currentView="day"
            currentDate={dateStr}
            currentWeek={currentWeekStr}
            currentMonth={currentMonthStr}
            teacherId={teacher}
          />
          <DayNav dateStr={dateStr} todayStr={todayStr} teacherId={teacher} />
          <CalendarTeacherSelect
            teachers={activeTeachers}
            teacherId={teacher}
            view="day"
            dateStr={dateStr}
          />
        </div>
        <DayView
          dateStr={dateStr}
          lessons={lessons}
          holidays={holidays}
          timezone={timezone}
          weekStr={weekStr}
          teacherId={teacher}
          studentId={studentFilter}
        />
      </div>
    )
  }

  // ─── MONTH VIEW ────────────────────────────────────────────────────────────
  const monthStr = month ?? currentMonthStr
  const cells = getMonthDays(monthStr)

  const firstCell = cells.find((c) => c.isCurrentMonth) ?? cells[0]
  const lastCell = [...cells].reverse().find((c) => c.isCurrentMonth) ?? cells[cells.length - 1]

  const lessons = await getLessonsForRange(
    orgId,
    timezone,
    firstCell.dateStr,
    lastCell.dateStr,
    teacher,
    studentFilter
  )

  // Compute week anchor (Sunday) for lesson back-links
  const anchorBase = new Date(`${firstCell.dateStr}T12:00:00Z`)
  const anchorDow = anchorBase.getUTCDay()
  const anchorSunday = new Date(anchorBase.getTime() - anchorDow * 24 * 60 * 60 * 1000)
  const weekStr = anchorSunday.toISOString().substring(0, 10)

  const monthCalendar = await buildMonthCalendarPayload({
    cells,
    lessons,
    holidays,
    timezone,
    todayStr,
    monthStr,
    weekStr,
    teacherId: teacher,
    studentId: studentFilter,
  })

  return (
    <div>
      <PageHeader title={VIEW_TITLES.month} actions={headerActions} />
      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <ViewToggle
          currentView="month"
          currentDate={todayStr}
          currentWeek={currentWeekStr}
          currentMonth={monthStr}
          teacherId={teacher}
        />
        <MonthNav
          monthStr={monthStr}
          currentMonthStr={currentMonthStr}
          teacherId={teacher}
        />
        <CalendarTeacherSelect
          teachers={activeTeachers}
          teacherId={teacher}
          view="month"
          monthStr={monthStr}
        />
      </div>
      <LessonsScheduleSection
        variant="month"
        todayStr={todayStr}
        calendar={monthCalendar}
        isAdmin={isAdmin}
        scheduleForm={scheduleForm}
        defaultTeacherId={teacher}
      />
    </div>
  )
}
