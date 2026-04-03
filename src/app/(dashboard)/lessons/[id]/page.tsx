import Link from 'next/link'
import { forbidden, notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getLessonAccessScope, getLessonById, formatTime, formatDate, LessonStatus } from '@/lib/lessons'
import { LessonStatusForm } from '@/components/dashboard/lessons/LessonStatusForm'
import { CancelLessonForm } from '@/components/dashboard/lessons/CancelLessonForm'
import { SeriesBanner } from '@/components/dashboard/lessons/SeriesBanner'
import { setLessonStatus, cancelLesson, cancelSeriesAction } from './actions'

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

export default async function LessonDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ week?: string; teacher?: string }>
}) {
  const { id } = await props.params
  const { week, teacher } = await props.searchParams
  const { orgId, role } = await getSession()
  const canCancel = role === 'owner' || role === 'admin'
  const timezone = await getOrgTimezone(orgId)

  const lesson = await getLessonById(id, orgId)
  if (!lesson) {
    const scope = await getLessonAccessScope(id)
    if (scope && scope.organizationId !== orgId) {
      forbidden()
    }
    notFound()
  }

  const backParams = new URLSearchParams()
  if (week) backParams.set('week', week)
  if (teacher) backParams.set('teacher', teacher)
  const backHref = `/lessons${backParams.size > 0 ? `?${backParams.toString()}` : ''}`

  const boundAction = setLessonStatus.bind(null, id)
  const boundCancelSeriesAction = cancelSeriesAction.bind(null, id)

  return (
    <div className="max-w-lg">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href={backHref} className="hover:text-gray-700">
          שיעורים
        </Link>
        <ArrowRight size={14} className="rotate-180" />
        <span className="text-gray-900 font-medium">פרטי שיעור</span>
      </div>

      {/* Series banner */}
      {canCancel && lesson.series_id && (
        <SeriesBanner cancelSeriesAction={boundCancelSeriesAction} />
      )}

      {/* Lesson details */}
      <div className="bg-white rounded-lg border border-gray-100 p-6 space-y-4">
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
          <div className="flex justify-between">
            <dt className="text-gray-500">מורה</dt>
            <dd className="text-gray-900 font-medium">{lesson.teacher.full_name}</dd>
          </div>
          {lesson.cancel_reason && (
            <div className="flex justify-between">
              <dt className="text-gray-500">סיבת ביטול</dt>
              <dd className="text-gray-900">{lesson.cancel_reason}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Actions card — status update + optional cancel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-4 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">עדכון סטטוס</h2>
          <LessonStatusForm currentStatus={lesson.status} action={boundAction} />
        </div>

        {canCancel && lesson.status !== 'cancelled' && (
          <div className="border-t border-gray-100 pt-5">
            <CancelLessonForm action={cancelLesson.bind(null, lesson.id)} />
          </div>
        )}
      </div>
    </div>
  )
}
