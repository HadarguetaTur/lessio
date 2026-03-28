import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import {
  getLessonsForWeek,
  getCurrentWeekSunday,
  getWeekDays,
  formatTime,
  LessonStatus,
} from '@/lib/lessons'
import { getTeacherByProfileId } from '@/lib/teachers'
import { TeacherWeekNav } from '@/components/dashboard/lessons/TeacherWeekNav'
import { getOrgHolidays } from '@/lib/organizations/holidays'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const STATUS_STYLES: Record<LessonStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border border-blue-100',
  completed: 'bg-green-50 text-green-700 border border-green-100',
  cancelled: 'bg-gray-100 text-gray-400 border border-gray-200 line-through',
  no_show: 'bg-yellow-50 text-yellow-700 border border-yellow-100',
}

export default async function TeacherSchedulePage(props: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await props.searchParams
  const { userId, orgId, role } = await getSession()

  if (role !== 'teacher') {
    redirect('/dashboard')
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return (
      <div className="text-center mt-16 text-sm text-gray-500">
        לא נמצאה רשומת מורה פעילה עבור משתמש זה. פנה למנהל המערכת.
      </div>
    )
  }

  const timezone = await getOrgTimezone(orgId)
  const weekStr = week ?? getCurrentWeekSunday(timezone)
  const weekDays = getWeekDays(weekStr)

  const [lessons, holidays] = await Promise.all([
    getLessonsForWeek(orgId, timezone, weekStr, teacher.id),
    getOrgHolidays(orgId),
  ])

  const holidayDates = new Set(holidays.map((h) => h.date))

  const byDay = new Map<string, typeof lessons>()
  weekDays.forEach((d) => byDay.set(d, []))
  lessons.forEach((l) => {
    const localDate = new Date(l.start_at).toLocaleDateString('sv-SE', { timeZone: timezone })
    byDay.get(localDate)?.push(l)
  })

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: timezone })

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">השיעורים שלי</h1>
        <TeacherWeekNav weekStr={weekStr} />
      </div>

      {/* Calendar grid — 7 columns. Horizontal scroll on small viewports. */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="grid grid-cols-7 gap-1.5 min-w-[560px]">
        {weekDays.map((dateStr, i) => {
          const dayLessons = byDay.get(dateStr) ?? []
          const isToday = dateStr === todayStr
          const dayNum = new Date(`${dateStr}T12:00:00Z`).getUTCDate()

          return (
            <div
              key={dateStr}
              className={`rounded-lg border min-h-36 ${
                isToday ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white'
              }`}
            >
              {/* Day header */}
              <div
                className={`px-2 py-1.5 text-center border-b ${
                  isToday ? 'border-blue-200' : 'border-gray-100'
                }`}
              >
                <p className="text-xs text-gray-500">{DAY_NAMES[i]}</p>
                <p className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>
                  {dayNum}
                </p>
              </div>

              {/* Holiday label */}
              {holidayDates.has(dateStr) && (
                <div className="px-1.5 py-0.5 mx-1 mt-1 text-xs text-center text-purple-600 bg-purple-50 rounded border border-purple-100 truncate">
                  {holidays.find((h) => h.date === dateStr)?.name}
                </div>
              )}

              {/* Lessons */}
              <div className="p-1 space-y-1">
                {dayLessons.length === 0 ? null : (
                  dayLessons.map((lesson) => (
                    <Link
                      key={lesson.id}
                      href={`/teacher/schedule/${lesson.id}?week=${weekStr}`}
                      className={`block rounded px-1.5 py-1 text-xs leading-snug ${STATUS_STYLES[lesson.status]} hover:opacity-75 transition-opacity`}
                    >
                      <span dir="ltr" className="font-mono block">
                        {formatTime(lesson.start_at, timezone)}
                      </span>
                      <span className="truncate block">{lesson.student.full_name}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>

      {/* Empty state */}
      {lessons.length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-10">אין שיעורים בשבוע זה.</p>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200 inline-block" />
          מתוכנן
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block" />
          הושלם
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200 inline-block" />
          לא הגיע
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block" />
          בוטל
        </span>
      </div>
    </div>
  )
}
