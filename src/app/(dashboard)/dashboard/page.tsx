import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TrendingUp, AlertCircle, CalendarDays, GraduationCap } from 'lucide-react'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTodayLessons, formatTime, LessonStatus, Lesson } from '@/lib/lessons'
import { getDashboardStats } from '@/lib/dashboard/stats'
import { KpiCard } from '@/components/dashboard/KpiCard'

const HEBREW_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const HEBREW_WEEKDAYS = ['שני','שלישי','רביעי','חמישי','שישי','שבת','ראשון'] // Luxon: 1=Mon … 7=Sun

function formatHebrewDate(dt: DateTime): string {
  const day = HEBREW_WEEKDAYS[dt.weekday - 1]
  const month = HEBREW_MONTHS[dt.month - 1]
  return `יום ${day}, ${dt.day} ב${month}`
}

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
  const { orgId, role } = await getSession()

  if (role === 'teacher') {
    redirect('/teacher/schedule')
  }
  const timezone = await getOrgTimezone(orgId)
  const todayLabel = formatHebrewDate(DateTime.now().setZone(timezone))
  const [lessons, stats] = await Promise.all([
    getTodayLessons(orgId, timezone),
    getDashboardStats(orgId, timezone),
  ])

  const total = lessons.length
  const scheduled = countByStatus(lessons, 'scheduled')
  const completed = countByStatus(lessons, 'completed')
  const noShow = countByStatus(lessons, 'no_show')
  const cancelled = countByStatus(lessons, 'cancelled')

  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 leading-none">לוח הבקרה</h1>
        <p className="text-sm text-gray-400 mt-1">{todayLabel}</p>
      </div>

      {/* KPI cards */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="הכנסה החודש"
          value={`₪${stats.monthlyRevenue.toLocaleString('he-IL')}`}
          icon={TrendingUp}
        />
        <KpiCard
          label="חוב פתוח"
          value={`₪${stats.pendingDebt.toLocaleString('he-IL')}`}
          highlight={stats.pendingDebt > 0}
          icon={AlertCircle}
        />
        <KpiCard label="שיעורים החודש" value={stats.lessonsThisMonth} icon={CalendarDays} />
        <KpiCard label="תלמידים פעילים" value={stats.activeStudents} icon={GraduationCap} />
      </section>

      {/* Today's status counters — secondary row, visually lighter than KPI cards */}
      <div className="mb-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">סטטוס היום</p>
        <div className="grid grid-cols-5 gap-2 mb-6">
          <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-gray-800 leading-none">{total}</p>
            <p className="text-xs text-gray-400 mt-1.5">סה״כ</p>
          </div>
          <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-blue-600 leading-none">{scheduled}</p>
            <p className="text-xs text-gray-400 mt-1.5">מתוכננים</p>
          </div>
          <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-green-600 leading-none">{completed}</p>
            <p className="text-xs text-gray-400 mt-1.5">הושלמו</p>
          </div>
          <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-yellow-600 leading-none">{noShow}</p>
            <p className="text-xs text-gray-400 mt-1.5">לא הגיע</p>
          </div>
          <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-red-500 leading-none">{cancelled}</p>
            <p className="text-xs text-gray-400 mt-1.5">בוטלו</p>
          </div>
        </div>
      </div>

      {/* Lessons table */}
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">שיעורים — היום</p>
      {lessons.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 flex flex-col items-center gap-2">
          <CalendarDays size={32} className="text-gray-200" />
          <p className="text-sm text-gray-400">אין שיעורים מתוכננים להיום</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  שעה
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  תלמיד
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  מורה
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  סטטוס
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lessons.map((lesson) => (
                <tr key={lesson.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3.5 text-sm font-mono text-gray-600" dir="ltr">
                    {formatTime(lesson.start_at, timezone)}–{formatTime(lesson.end_at, timezone)}
                  </td>
                  <td className="px-4 py-3.5 text-sm font-medium">
                    <Link
                      href={`/lessons/${lesson.id}`}
                      className="text-gray-900 hover:text-blue-700 hover:underline underline-offset-2"
                    >
                      {lesson.student.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-500">
                    {lesson.teacher.full_name}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[lesson.status]}`}
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
