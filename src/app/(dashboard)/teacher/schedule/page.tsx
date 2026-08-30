import { redirect } from 'next/navigation'
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
import { getTeacherByProfileId } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { getOrgHolidays, calendarHolidaysFrom } from '@/lib/organizations/holidays'
import { WeekNav } from '@/components/dashboard/lessons/WeekNav'
import { DayNav } from '@/components/dashboard/lessons/DayNav'
import { MonthNav } from '@/components/dashboard/lessons/MonthNav'
import { ViewToggle } from '@/components/dashboard/lessons/ViewToggle'
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

const SCHEDULE_BASE = '/teacher/schedule'

type CalendarView = 'day' | 'week' | 'month'

export default async function TeacherSchedulePage(props: {
  searchParams: Promise<{
    view?: string
    week?: string
    date?: string
    month?: string
    student?: string
  }>
}) {
  const t = await getTranslations('teacherSelf')
  const { view: viewParam, week, date, month, student: studentParam } = await props.searchParams
  const studentParsed = z.string().uuid().safeParse(studentParam)
  const view: CalendarView =
    viewParam === 'day' || viewParam === 'month' ? viewParam : 'week'

  const { userId, orgId, role } = await getSession()
  if (role !== 'teacher') {
    redirect('/dashboard')
  }

  const [tSchedule, tLessons, tCommon] = await Promise.all([
    getTranslations('teacherSelf.schedule'),
    getTranslations('lessons'),
    getTranslations('common'),
  ])

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return (
      <div className="text-center mt-16 text-sm text-muted-foreground">
        {t('noTeacherRecordContact')}
      </div>
    )
  }

  const timezone = await getOrgTimezone(orgId)
  const todayStr = getCurrentDayStr(timezone)
  const currentWeekStr = getCurrentWeekSunday(timezone)
  const currentMonthStr = todayStr.substring(0, 7)

  const [students, holidays] = await Promise.all([
    getStudents(orgId, { teacherId: teacher.id }),
    getOrgHolidays(orgId, { from: calendarHolidaysFrom() }),
  ])

  const roster = students.filter((s) => s.is_active)
  const studentFilter =
    studentParsed.success && roster.some((s) => s.id === studentParsed.data)
      ? studentParsed.data
      : undefined
  const scheduleForm: ScheduleFormResources = {
    teachers: [{ id: teacher.id, full_name: teacher.profile.full_name }],
    students: roster.map((s) => ({ id: s.id, full_name: s.full_name })),
    groups: [],
  }

  const headerActions = (
    <LessonsScheduleHeaderActions
      variant="teacher"
      labels={{
        import: tCommon('actions.import'),
        newSeries: tLessons('newSeries'),
        newLesson: tLessons('newLesson'),
      }}
    />
  )

  // ─── WEEK VIEW ─────────────────────────────────────────────────────────────
  if (view === 'week') {
    const weekStr = week ?? currentWeekStr
    const weekDays = getWeekDays(weekStr, timezone)
    const lessons = await getLessonsForWeek(orgId, timezone, weekStr, teacher.id, studentFilter)

    const weekCalendar = await buildWeekCalendarPayload({
      weekDays,
      lessons,
      holidays,
      timezone,
      todayStr,
      weekStr,
      scheduleBasePath: SCHEDULE_BASE,
      studentId: studentFilter,
    })

    return (
      <LessonScheduleSheetProvider
        headerDefaultDate={todayStr}
        scheduleForm={scheduleForm}
        defaultTeacherId={teacher.id}
        allowGroupLessons={false}
      >
        <Suspense fallback={null}>
          <LessonsNewLessonFromQuery />
        </Suspense>
        <div>
          <PageHeader title={tSchedule('title')} actions={headerActions} mobileCentered />
          <div className="mb-5 flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-3 sm:overflow-x-hidden">
            <div className="w-full shrink-0 sm:w-auto">
              <ViewToggle
                scheduleBasePath={SCHEDULE_BASE}
                currentView="week"
                currentDate={todayStr}
                currentWeek={weekStr}
                currentMonth={currentMonthStr}
              />
            </div>
            <div className="flex w-full min-w-0 justify-center sm:block sm:flex-1 sm:min-w-0 sm:justify-start">
              <WeekNav
                scheduleBasePath={SCHEDULE_BASE}
                weekStr={weekStr}
                teachers={[]}
                currentWeekStr={currentWeekStr}
                showTeacherFilter={false}
              />
            </div>
          </div>
          <LessonsScheduleSection
            variant="week"
            todayStr={todayStr}
            calendar={weekCalendar}
            scheduleForm={scheduleForm}
            defaultTeacherId={teacher.id}
          />
        </div>
      </LessonScheduleSheetProvider>
    )
  }

  // ─── DAY VIEW ──────────────────────────────────────────────────────────────
  if (view === 'day') {
    const dateStr = date ?? todayStr

    const base = new Date(`${dateStr}T12:00:00Z`)
    const dow = base.getUTCDay()
    const sundayMs = base.getTime() - dow * 24 * 60 * 60 * 1000
    const weekStr = new Date(sundayMs).toISOString().substring(0, 10)

    const lessons = await getLessonsForRange(
      orgId,
      timezone,
      dateStr,
      dateStr,
      teacher.id,
      studentFilter
    )

    return (
      <LessonScheduleSheetProvider
        headerDefaultDate={dateStr}
        scheduleForm={scheduleForm}
        defaultTeacherId={teacher.id}
        allowGroupLessons={false}
      >
        <Suspense fallback={null}>
          <LessonsNewLessonFromQuery />
        </Suspense>
        <div>
          <PageHeader title={tSchedule('title')} actions={headerActions} mobileCentered />
          <div className="mb-5 flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-3 sm:overflow-x-hidden">
            <div className="w-full shrink-0 sm:w-auto">
              <ViewToggle
                scheduleBasePath={SCHEDULE_BASE}
                currentView="day"
                currentDate={dateStr}
                currentWeek={currentWeekStr}
                currentMonth={currentMonthStr}
              />
            </div>
            <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:touch-pan-x sm:scrollbar-hide sm:py-1 sm:min-w-0 sm:flex-1">
              <div className="flex w-full shrink-0 justify-center sm:w-auto sm:justify-start">
                <DayNav
                  scheduleBasePath={SCHEDULE_BASE}
                  dateStr={dateStr}
                  todayStr={todayStr}
                />
              </div>
            </div>
          </div>
          <DayView
            dateStr={dateStr}
            lessons={lessons}
            holidays={holidays}
            timezone={timezone}
            weekStr={weekStr}
            scheduleBasePath={SCHEDULE_BASE}
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
    teacher.id,
    studentFilter
  )

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
    scheduleBasePath: SCHEDULE_BASE,
    studentId: studentFilter,
  })

  return (
    <LessonScheduleSheetProvider
      headerDefaultDate={todayStr}
      scheduleForm={scheduleForm}
      defaultTeacherId={teacher.id}
      allowGroupLessons={false}
    >
      <Suspense fallback={null}>
        <LessonsNewLessonFromQuery />
      </Suspense>
      <div>
        <PageHeader title={tSchedule('title')} actions={headerActions} mobileCentered />
        <div className="mb-5 flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-3 sm:overflow-x-hidden">
          <div className="w-full shrink-0 sm:w-auto">
            <ViewToggle
              scheduleBasePath={SCHEDULE_BASE}
              currentView="month"
              currentDate={todayStr}
              currentWeek={currentWeekStr}
              currentMonth={monthStr}
            />
          </div>
          <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:touch-pan-x sm:scrollbar-hide sm:py-1 sm:min-w-0 sm:flex-1">
            <div className="flex w-full shrink-0 justify-center sm:w-auto sm:justify-start">
              <MonthNav
                scheduleBasePath={SCHEDULE_BASE}
                monthStr={monthStr}
                currentMonthStr={currentMonthStr}
              />
            </div>
          </div>
        </div>
        <LessonsScheduleSection
          variant="month"
          todayStr={todayStr}
          calendar={monthCalendar}
          scheduleForm={scheduleForm}
          defaultTeacherId={teacher.id}
        />
      </div>
    </LessonScheduleSheetProvider>
  )
}
