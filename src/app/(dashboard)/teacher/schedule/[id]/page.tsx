import Link from 'next/link'
import { forbidden, notFound, redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getLessonAccessScope, getLessonById, formatTime, formatDate, LessonStatus } from '@/lib/lessons'
import { getTeacherByProfileId } from '@/lib/teachers'
import { TeacherLessonOutcomeForm } from '@/components/dashboard/lessons/TeacherLessonOutcomeForm'
import { updateTeacherLessonOutcome } from './actions'

const STATUS_LABELS: Record<LessonStatus, string> = {
  scheduled: 'מתוכנן',
  completed: 'הושלם',
  cancelled: 'בוטל',
  no_show: 'לא הגיע',
}

const STATUS_STYLES: Record<LessonStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  no_show: 'bg-yellow-50 text-yellow-700',
}

export default async function TeacherLessonDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { id } = await props.params
  const { week } = await props.searchParams
  const { userId, orgId, role } = await getSession()

  if (role !== 'teacher') {
    redirect('/dashboard')
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    redirect('/teacher/schedule')
  }

  const timezone = await getOrgTimezone(orgId)
  const lesson = await getLessonById(id, orgId)

  if (!lesson) {
    const scope = await getLessonAccessScope(id)
    if (scope && (scope.organizationId !== orgId || scope.teacherId !== teacher.id)) {
      forbidden()
    }
    notFound()
  }

  // Lesson belongs to another teacher — 403
  if (lesson.teacher.id !== teacher.id) {
    forbidden()
  }

  const backHref = `/teacher/schedule${week ? `?week=${week}` : ''}`

  return (
    <div className="max-w-lg">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href={backHref} className="hover:text-gray-700">
          השיעורים שלי
        </Link>
        <ArrowRight size={14} className="rotate-180" />
        <span className="text-gray-900 font-medium">פרטי שיעור</span>
      </div>

      {/* Lesson details */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">פרטי שיעור</h1>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-medium ${STATUS_STYLES[lesson.status]}`}
          >
            {STATUS_LABELS[lesson.status]}
          </span>
        </div>

        <hr className="border-gray-100" />

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">תאריך</dt>
            <dd className="text-gray-900 font-medium">{formatDate(lesson.start_at, timezone)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">שעה</dt>
            <dd className="text-gray-900 font-medium font-mono" dir="ltr">
              {formatTime(lesson.start_at, timezone)}–{formatTime(lesson.end_at, timezone)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">תלמיד</dt>
            <dd className="text-gray-900 font-medium">{lesson.student.full_name}</dd>
          </div>
          {lesson.cancel_reason && (
            <div className="flex justify-between">
              <dt className="text-gray-500">סיבת ביטול</dt>
              <dd className="text-gray-900">{lesson.cancel_reason}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Outcome update — teacher can only set completed / no_show */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">עדכון תוצאת שיעור</h2>
        <TeacherLessonOutcomeForm
          currentStatus={lesson.status}
          action={updateTeacherLessonOutcome.bind(null, lesson.id)}
        />
      </div>

      <div className="mt-4">
        <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700">
          ← חזרה ללוח
        </Link>
      </div>
    </div>
  )
}
