import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTodayLessons, formatTime, LessonStatus, Lesson } from '@/lib/lessons'

const STATUS_LABELS: Record<LessonStatus, string> = {
  scheduled: 'מתוכנן',
  completed: 'הושלם',
  cancelled: 'בוטל',
  no_show: 'לא הגיע',
}

const STATUS_STYLES: Record<LessonStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-500',
  no_show: 'bg-yellow-50 text-yellow-700',
}

function countByStatus(lessons: Lesson[], status: LessonStatus) {
  return lessons.filter((l) => l.status === status).length
}

export default async function DashboardPage() {
  const { orgId } = await getSession()
  const timezone = await getOrgTimezone(orgId)
  const lessons = await getTodayLessons(orgId, timezone)

  const total = lessons.length
  const scheduled = countByStatus(lessons, 'scheduled')
  const completed = countByStatus(lessons, 'completed')
  const noShow = countByStatus(lessons, 'no_show')
  const cancelled = countByStatus(lessons, 'cancelled')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">לוח הבקרה — היום</h1>

      {/* Counter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{total}</p>
          <p className="text-xs text-gray-500 mt-0.5">סה״כ שיעורים</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{scheduled}</p>
          <p className="text-xs text-gray-500 mt-0.5">מתוכננים</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-600">{completed}</p>
          <p className="text-xs text-gray-500 mt-0.5">הושלמו</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{noShow}</p>
          <p className="text-xs text-gray-500 mt-0.5">לא הגיע</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-red-500">{cancelled}</p>
          <p className="text-xs text-gray-500 mt-0.5">בוטלו</p>
        </div>
      </div>

      {/* Lessons table */}
      {lessons.length === 0 ? (
        <p className="text-sm text-gray-400 text-center mt-16">אין שיעורים להיום.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  שעה
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  תלמיד
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  מורה
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  סטטוס
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lessons.map((lesson) => (
                <tr key={lesson.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-gray-700" dir="ltr">
                    {formatTime(lesson.start_at, timezone)}–{formatTime(lesson.end_at, timezone)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {lesson.student.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {lesson.teacher.full_name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[lesson.status]}`}
                    >
                      {STATUS_LABELS[lesson.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
