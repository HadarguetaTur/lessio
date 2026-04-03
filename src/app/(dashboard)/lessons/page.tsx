import Link from 'next/link'
import { Repeat, Plus } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import {
  getLessonsForWeek,
  getCurrentWeekSunday,
  getWeekDays,
  formatTime,
  LessonStatus,
} from '@/lib/lessons'
import { getTeachers } from '@/lib/teachers'
import { getOrgHolidays } from '@/lib/organizations/holidays'
import { WeekNav } from '@/components/dashboard/lessons/WeekNav'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const STATUS_STYLES: Record<LessonStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border border-blue-100',
  completed: 'bg-green-50 text-green-700 border border-green-100',
  cancelled: 'bg-gray-100 text-gray-400 border border-gray-200 line-through',
  no_show: 'bg-yellow-50 text-yellow-700 border border-yellow-100',
}

export default async function LessonsPage(props: {
  searchParams: Promise<{ week?: string; teacher?: string }>
}) {
  const { week, teacher } = await props.searchParams
  const { orgId, role } = await getSession()
  const timezone = await getOrgTimezone(orgId)

  const currentWeekStr = getCurrentWeekSunday(timezone)
  const weekStr = week ?? currentWeekStr
  const weekDays = getWeekDays(weekStr)

  const [lessons, teachers, holidays] = await Promise.all([
    getLessonsForWeek(orgId, timezone, weekStr, teacher),
    getTeachers(orgId),
    getOrgHolidays(orgId),
  ])

  const holidayDates = new Set(holidays.map((h) => h.date))

  // Group lessons by local date (YYYY-MM-DD in org timezone)
  const byDay = new Map<string, typeof lessons>()
  weekDays.forEach((d) => byDay.set(d, []))
  lessons.forEach((l) => {
    const localDate = new Date(l.start_at).toLocaleDateString('sv-SE', { timeZone: timezone })
    byDay.get(localDate)?.push(l)
  })

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: timezone })

  const activeTeachers = teachers
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, full_name: t.profile.full_name }))

  return (
    <div>
      {/* Row 1: Title + action buttons */}
      <div className="flex items-center justify-between mb-3 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">לוח שיעורים שבועי</h1>
        {(role === 'owner' || role === 'admin') && (
          <div className="flex items-center gap-2">
            <Link
              href="/lessons/new"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              שיעור חד פעמי
            </Link>
            <Link
              href="/lessons/new-series"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Repeat size={14} />
              שיעורים קבועים
            </Link>
          </div>
        )}
      </div>

      {/* Row 2: Week navigation + teacher filter */}
      <div className="mb-5">
        <WeekNav weekStr={weekStr} teachers={activeTeachers} teacherId={teacher} currentWeekStr={currentWeekStr} />
      </div>

      {/* Calendar grid — 7 columns */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((dateStr, i) => {
          const dayLessons = byDay.get(dateStr) ?? []
          const isToday = dateStr === todayStr
          const dayNum = new Date(`${dateStr}T12:00:00Z`).getUTCDate()

          return (
            <div
              key={dateStr}
              className={`rounded-lg border min-h-36 ${
                isToday
                  ? 'border-blue-300 bg-blue-50/30'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Day header */}
              <div
                className={`px-2 py-1.5 text-center border-b ${
                  isToday ? 'border-blue-200' : 'border-gray-100'
                }`}
              >
                <p className="text-xs text-gray-500">{DAY_NAMES[i]}</p>
                <p
                  className={`text-sm font-bold ${
                    isToday ? 'text-blue-600' : 'text-gray-800'
                  }`}
                >
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
                {dayLessons.map((lesson) => (
                  <Link
                    key={lesson.id}
                    href={`/lessons/${lesson.id}?week=${weekStr}${teacher ? `&teacher=${teacher}` : ''}`}
                    className={`block rounded px-1.5 py-1 text-xs leading-snug ${STATUS_STYLES[lesson.status]} hover:opacity-75 transition-opacity`}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span dir="ltr" className="font-mono">
                        {formatTime(lesson.start_at, timezone)}
                      </span>
                      {lesson.series_id && (
                        <Repeat size={10} className="shrink-0 opacity-70" />
                      )}
                    </span>
                    <span className="truncate block">{lesson.student.full_name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>

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
