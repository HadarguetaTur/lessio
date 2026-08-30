import Link from 'next/link'
import { forbidden, notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getLessonAccessScope, getLessonById, formatTime, formatDate, LessonStatus } from '@/lib/lessons'
import { getTeacherByProfileId } from '@/lib/teachers'
import { TeacherLessonOutcomeForm } from '@/components/dashboard/lessons/TeacherLessonOutcomeForm'
import { CancelLessonForm } from '@/components/dashboard/lessons/CancelLessonForm'
import { updateTeacherLessonOutcome } from './actions'
import { cancelLesson } from '@/app/(dashboard)/lessons/[id]/actions'
import { renderCancelReason } from '@/lib/lessons/renderCancelReason'

const STATUS_STYLES: Record<LessonStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-muted-foreground',
  no_show: 'bg-yellow-50 text-yellow-700',
}

export default async function TeacherLessonDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { id } = await props.params
  const { week } = await props.searchParams
  const { userId, orgId, role } = await getSession()
  const [t, tLessons, tCommon, locale] = await Promise.all([
    getTranslations('teacherSelf.schedule'),
    getTranslations('lessons'),
    getTranslations('common'),
    getLocale(),
  ])
  const appLocale = parseAppLocale(locale)
  // "Back" points against the reading direction, so the glyph flips with it.
  const BackIcon = appLocale === 'he' ? ArrowRight : ArrowLeft

  const STATUS_LABELS: Record<LessonStatus, string> = {
    scheduled: tCommon('status.scheduled'),
    completed: tCommon('status.completed'),
    cancelled: tCommon('status.cancelled'),
    no_show: tCommon('status.no_show'),
  }

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
      <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
        <Link href={backHref} className="hover:text-gray-700">
          {t('title')}
        </Link>
        <ArrowRight size={14} className="rtl:rotate-180" aria-hidden />
        <span className="text-gray-900 font-medium">{tLessons('detailTitle')}</span>
      </div>

      {/* Lesson details */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{tLessons('detailTitle')}</h1>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-medium ${STATUS_STYLES[lesson.status]}`}
          >
            {STATUS_LABELS[lesson.status]}
          </span>
        </div>

        <hr className="border-gray-100" />

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{tCommon('table.date')}</dt>
            <dd className="text-gray-900 font-medium">{formatDate(lesson.start_at, timezone, appLocale)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{tCommon('table.time')}</dt>
            <dd className="text-gray-900 font-medium font-mono" dir="ltr">
              {formatTime(lesson.start_at, timezone, appLocale)}–{formatTime(lesson.end_at, timezone, appLocale)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{tCommon('table.student')}</dt>
            <dd className="text-gray-900 font-medium">{lesson.student.full_name}</dd>
          </div>
          {lesson.cancel_reason && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{tLessons('cancel.reason')}</dt>
              <dd className="text-gray-900">{renderCancelReason(lesson.cancel_reason, tLessons)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Outcome update — teacher can only set completed / no_show */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{tLessons('statusUpdate')}</h2>
        <TeacherLessonOutcomeForm
          currentStatus={lesson.status}
          action={updateTeacherLessonOutcome.bind(null, lesson.id)}
        />
      </div>

      {/* A teacher who falls ill had no way to cancel — only an admin did. The
          fee still follows the org's cancellation policy; waiving it does not
          belong to the teacher, so that control is hidden. */}
      {lesson.status === 'scheduled' && (
        <div className="mt-4">
          <CancelLessonForm action={cancelLesson.bind(null, lesson.id)} showWaive={false} />
        </div>
      )}

      <div className="mt-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-700"
        >
          <BackIcon size={14} aria-hidden />
          {tCommon('actions.back')}
        </Link>
      </div>
    </div>
  )
}
