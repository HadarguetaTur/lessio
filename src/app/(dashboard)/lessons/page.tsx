import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import {
  getLessonsForWeek,
  getLessonsForRange,
  getCurrentWeekSunday,
  getCurrentDayStr,
  getWeekDays,
  getMonthDays,
  filterCalendarLessons,
} from '@/lib/lessons'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { getGroups } from '@/lib/groups'
import { getOrgHolidays, calendarHolidaysFrom } from '@/lib/organizations/holidays'
import { WeekNav } from '@/components/dashboard/lessons/WeekNav'
import { DayNav } from '@/components/dashboard/lessons/DayNav'
import { MonthNav } from '@/components/dashboard/lessons/MonthNav'
import { ViewToggle } from '@/components/dashboard/lessons/ViewToggle'
import { CalendarTeacherSelect } from '@/components/dashboard/lessons/CalendarTeacherSelect'
import { CancelledToggle } from '@/components/dashboard/lessons/CancelledToggle'
import { CANCELLED_ON } from '@/components/dashboard/lessons/calendarParams'
import { buildWeekCalendarPayload } from '@/components/dashboard/lessons/WeekView'
import { buildMonthCalendarPayload } from '@/components/dashboard/lessons/MonthView'
import {
  LessonsScheduleSection,
  type ScheduleFormResources,
} from '@/components/dashboard/lessons/LessonsScheduleSection'
import { LessonScheduleSheetProvider } from '@/components/dashboard/lessons/LessonScheduleSheetProvider'
import { LessonsScheduleHeaderActions } from '@/components/dashboard/lessons/LessonsScheduleHeaderActions'
import { DayView } from '@/components/dashboard/lessons/DayView'
import { PageHeader } from '@/components/ui/page-header'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { z } from 'zod'
import { LessonsNewLessonFromQuery } from '@/components/dashboard/lessons/LessonsNewLessonFromQuery'

type CalendarView = 'day' | 'week' | 'month'

export default async function LessonsPage(props: {
  searchParams: Promise<{
    view?: string
    week?: string
    date?: string
    month?: string
    teacher?: string
    student?: string
    cancelled?: string
  }>
}) {
  const { view: viewParam, week, date, month, teacher, student: studentParam, cancelled } =
    await props.searchParams
  const studentParsed = z.string().uuid().safeParse(studentParam)
  const studentFilter = studentParsed.success ? studentParsed.data : undefined
  const includeCancelled = cancelled === CANCELLED_ON
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
    getOrgHolidays(orgId, { from: calendarHolidaysFrom() }),
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
    <LessonsScheduleHeaderActions
      labels={{
        import: tCommon('actions.import'),
        newSeries: t('newSeries'),
        newLesson: t('newLesson'),
      }}
    />
  ) : undefined

  // ─── WEEK VIEW ─────────────────────────────────────────────────────────────
  if (view === 'week') {
    const weekStr = week ?? currentWeekStr
    const weekDays = getWeekDays(weekStr, timezone)
    const lessons = await getLessonsForWeek(orgId, timezone, weekStr, teacher, studentFilter)
    const { visible, hiddenCount } = filterCalendarLessons(lessons, { includeCancelled })

    const weekCalendar = await buildWeekCalendarPayload({
      weekDays,
      lessons: visible,
      holidays,
      timezone,
      todayStr,
      weekStr,
      teacherId: teacher,
      studentId: studentFilter,
    })

    return (
      <LessonScheduleSheetProvider
        headerDefaultDate={todayStr}
        scheduleForm={scheduleForm}
        defaultTeacherId={teacher}
      >
        <Suspense fallback={null}>
          <LessonsNewLessonFromQuery />
        </Suspense>
        <div>
          <PageHeader title={VIEW_TITLES.week} actions={headerActions} mobileCentered />
          <div className="mb-5 flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-3 sm:overflow-x-hidden">
            <div className="w-full shrink-0 sm:w-auto">
              <ViewToggle
                currentView="week"
                currentDate={todayStr}
                currentWeek={weekStr}
                currentMonth={currentMonthStr}
                teacherId={teacher}
              />
            </div>
            <div className="flex w-full min-w-0 justify-center sm:block sm:flex-1 sm:min-w-0 sm:justify-start">
              <WeekNav
                weekStr={weekStr}
                teachers={activeTeachers}
                teacherId={teacher}
                currentWeekStr={currentWeekStr}
              />
            </div>
            <div className="flex w-full shrink-0 justify-center sm:w-auto sm:justify-start">
              <CancelledToggle hiddenCount={hiddenCount} active={includeCancelled} />
            </div>
          </div>
          <LessonsScheduleSection
            variant="week"
            todayStr={todayStr}
            calendar={weekCalendar}
            scheduleForm={scheduleForm}
            defaultTeacherId={teacher}
          />
        </div>
      </LessonScheduleSheetProvider>
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
    const { visible, hiddenCount } = filterCalendarLessons(lessons, { includeCancelled })

    return (
      <LessonScheduleSheetProvider
        headerDefaultDate={dateStr}
        scheduleForm={scheduleForm}
        defaultTeacherId={teacher}
      >
        <Suspense fallback={null}>
          <LessonsNewLessonFromQuery />
        </Suspense>
        <div>
          <PageHeader title={VIEW_TITLES.day} actions={headerActions} mobileCentered />
          <div className="mb-5 flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-3 sm:overflow-x-hidden">
            <div className="w-full shrink-0 sm:w-auto">
              <ViewToggle
                currentView="day"
                currentDate={dateStr}
                currentWeek={currentWeekStr}
                currentMonth={currentMonthStr}
                teacherId={teacher}
              />
            </div>
            <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:touch-pan-x sm:scrollbar-hide sm:py-1 sm:min-w-0 sm:flex-1">
              <div className="flex w-full shrink-0 justify-center sm:w-auto sm:justify-start">
                <DayNav dateStr={dateStr} todayStr={todayStr} teacherId={teacher} />
              </div>
              <div className="flex w-full shrink-0 justify-center sm:w-auto sm:min-w-0 sm:justify-start">
                <CalendarTeacherSelect
                  teachers={activeTeachers}
                  teacherId={teacher}
                  view="day"
                  dateStr={dateStr}
                />
              </div>
              <div className="flex w-full shrink-0 justify-center sm:w-auto sm:justify-start">
                <CancelledToggle hiddenCount={hiddenCount} active={includeCancelled} />
              </div>
            </div>
          </div>
          <DayView
            dateStr={dateStr}
            lessons={visible}
            holidays={holidays}
            timezone={timezone}
            weekStr={weekStr}
            teacherId={teacher}
            studentId={studentFilter}
          />
        </div>
      </LessonScheduleSheetProvider>
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
  const { visible, hiddenCount } = filterCalendarLessons(lessons, { includeCancelled })

  // Compute week anchor (Sunday) for lesson back-links
  const anchorBase = new Date(`${firstCell.dateStr}T12:00:00Z`)
  const anchorDow = anchorBase.getUTCDay()
  const anchorSunday = new Date(anchorBase.getTime() - anchorDow * 24 * 60 * 60 * 1000)
  const weekStr = anchorSunday.toISOString().substring(0, 10)

  const monthCalendar = await buildMonthCalendarPayload({
    cells,
    lessons: visible,
    holidays,
    timezone,
    todayStr,
    monthStr,
    weekStr,
    teacherId: teacher,
    studentId: studentFilter,
  })

  return (
    <LessonScheduleSheetProvider
      headerDefaultDate={todayStr}
      scheduleForm={scheduleForm}
      defaultTeacherId={teacher}
    >
      <Suspense fallback={null}>
        <LessonsNewLessonFromQuery />
      </Suspense>
      <div>
        <PageHeader title={VIEW_TITLES.month} actions={headerActions} mobileCentered />
        <div className="mb-5 flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-3 sm:overflow-x-hidden">
          <div className="w-full shrink-0 sm:w-auto">
            <ViewToggle
              currentView="month"
              currentDate={todayStr}
              currentWeek={currentWeekStr}
              currentMonth={monthStr}
              teacherId={teacher}
            />
          </div>
          <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:touch-pan-x sm:scrollbar-hide sm:py-1 sm:min-w-0 sm:flex-1">
            <div className="flex w-full shrink-0 justify-center sm:w-auto sm:justify-start">
              <MonthNav
                monthStr={monthStr}
                currentMonthStr={currentMonthStr}
                teacherId={teacher}
              />
            </div>
            <div className="flex w-full shrink-0 justify-center sm:w-auto sm:min-w-0 sm:justify-start">
              <CalendarTeacherSelect
                teachers={activeTeachers}
                teacherId={teacher}
                view="month"
                monthStr={monthStr}
              />
            </div>
            <div className="flex w-full shrink-0 justify-center sm:w-auto sm:justify-start">
              <CancelledToggle hiddenCount={hiddenCount} active={includeCancelled} />
            </div>
          </div>
        </div>
        <LessonsScheduleSection
          variant="month"
          todayStr={todayStr}
          calendar={monthCalendar}
          scheduleForm={scheduleForm}
          defaultTeacherId={teacher}
        />
      </div>
    </LessonScheduleSheetProvider>
  )
}
