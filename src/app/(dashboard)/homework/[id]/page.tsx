import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DateTime } from 'luxon'
import { ArrowRight, Paperclip, FileText } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getAssignment } from '@/lib/homework'
import { listAttachments, getAttachmentDownloadUrl } from '@/lib/homework/attachments'
import { getSubmissionsForAssignment } from '@/lib/homework/submissions'
import { GradingForm } from '@/components/dashboard/homework/GradingForm'
import { gradeSubmissionAction } from './actions'
import { getTranslations } from 'next-intl/server'

export default async function HomeworkDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId, role } = await getSession()
  const t = await getTranslations('homework')

  const assignment = await getAssignment(orgId, id)
  if (!assignment) notFound()

  const [attachments, submissions] = await Promise.all([
    listAttachments(orgId, id),
    getSubmissionsForAssignment(orgId, id),
  ])

  // Generate signed URLs for attachments
  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (a) => ({
      ...a,
      downloadUrl: await getAttachmentDownloadUrl(a.storagePath).catch(() => null),
    }))
  )

  const canGrade = role === 'owner' || role === 'admin' || role === 'teacher'

  const STATUS_LABEL: Record<string, string> = {
    pending: t('status.pending'),
    done: t('status.done'),
    overdue: t('status.overdue'),
  }
  const STATUS_CLASS: Record<string, string> = {
    pending: 'bg-blue-50 text-blue-700',
    done:    'bg-green-50 text-green-700',
    overdue: 'bg-red-50 text-red-700',
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/homework" className="hover:text-gray-700">{t('title')}</Link>
        <ArrowRight size={14} className="rotate-180" />
        <span className="text-gray-900 font-medium truncate">{assignment.title}</span>
      </div>

      {/* Assignment details */}
      <div className="bg-white rounded-lg border border-gray-100 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">{assignment.title}</h1>
          <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded text-sm font-medium ${STATUS_CLASS[assignment.status] ?? ''}`}>
            {STATUS_LABEL[assignment.status] ?? assignment.status}
          </span>
        </div>

        <hr className="border-gray-100" />

        <div className="text-sm text-gray-700 whitespace-pre-wrap">{assignment.body}</div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('fields.student')}</dt>
            <dd className="font-medium">{assignment.studentName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('fields.dueDate')}</dt>
            <dd className="font-medium">
              {assignment.dueDate ? DateTime.fromISO(assignment.dueDate).toFormat('d.M.yyyy') : '—'}
            </dd>
          </div>
          {assignment.sendAt && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('scheduledSend')}</dt>
              <dd className="font-medium">{new Date(assignment.sendAt).toLocaleString('he-IL')}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Attachments */}
      {attachmentsWithUrls.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <Paperclip size={14} />
            {t('attachments')} ({attachmentsWithUrls.length})
          </h2>
          <ul className="space-y-2">
            {attachmentsWithUrls.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <FileText size={14} className="text-muted-foreground shrink-0" />
                {a.downloadUrl ? (
                  <a href={a.downloadUrl} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate">
                    {a.fileName}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{a.fileName}</span>
                )}
                {a.sizeBytes && (
                  <span className="text-muted-foreground text-xs shrink-0">
                    ({Math.round(a.sizeBytes / 1024)} KB)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Submissions & grading */}
      <div className="bg-white rounded-lg border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">{t('submissions')} ({submissions.length})</h2>

        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noSubmissions')}</p>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <div key={sub.id} className="border border-gray-100 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{sub.studentName}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(sub.submittedAt).toLocaleDateString('he-IL')}
                  </span>
                </div>

                {sub.note && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{sub.note}</p>
                )}

                {sub.fileName && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Paperclip size={12} />
                    {sub.fileName}
                  </p>
                )}

                {sub.score != null ? (
                  <div className="bg-green-50 rounded p-3 text-sm">
                    <div className="font-semibold text-green-700">{t('grade')}: {sub.score}/100</div>
                    {sub.feedback && <div className="text-gray-600 mt-1">{sub.feedback}</div>}
                  </div>
                ) : canGrade ? (
                  <GradingForm
                    submissionId={sub.id}
                    assignmentId={id}
                    action={gradeSubmissionAction}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
