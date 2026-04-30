import { redirect, notFound } from 'next/navigation'
import { Paperclip, FileText, CheckCircle } from 'lucide-react'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { listAttachments, getAttachmentDownloadUrl } from '@/lib/homework/attachments'
import { getSubmission, getSubmissionDownloadUrl } from '@/lib/homework/submissions'
import { PortalTabBar } from '@/components/portal/PortalTabBar'
import { PortalSubmissionForm } from '@/components/portal/PortalSubmissionForm'
import { submitHomeworkAction } from './actions'

export default async function PortalHomeworkDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; id: string }>
}) {
  const { orgId, id } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  const db = createServiceRoleClient()

  // Fetch assignment
  const { data: assignment } = await db
    .from('homework_assignments')
    .select('id, title, body, due_date, status, student_id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (!assignment) notFound()

  type AsgRow = { id: string; title: string; body: string; due_date: string | null; status: string; student_id: string }
  const asg = assignment as unknown as AsgRow

  // Verify parent owns this student
  const { data: rel } = await db
    .from('relationships')
    .select('id')
    .eq('parent_id', session.parentId)
    .eq('student_id', asg.student_id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!rel) notFound()

  const [attachments, submission] = await Promise.all([
    listAttachments(orgId, id),
    getSubmission(orgId, id, asg.student_id),
  ])

  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (a) => ({
      ...a,
      downloadUrl: await getAttachmentDownloadUrl(a.storagePath).catch(() => null),
    }))
  )

  const submissionFileUrl = submission?.storagePath
    ? await getSubmissionDownloadUrl(submission.storagePath).catch(() => null)
    : null

  const boundAction = submitHomeworkAction.bind(null, orgId, id)

  return (
    <div className="flex flex-col flex-1 pb-20">
      <header className="px-4 py-3.5 border-b border-border bg-card">
        <h1 className="font-semibold text-foreground text-sm truncate">{asg.title}</h1>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {/* Assignment content */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="text-sm text-foreground whitespace-pre-wrap">{asg.body}</div>
          {asg.due_date && (
            <p className="text-xs text-muted-foreground">תאריך הגשה: {asg.due_date}</p>
          )}
          <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
            asg.status === 'done' ? 'bg-green-50 text-green-700' :
            asg.status === 'overdue' ? 'bg-red-50 text-red-700' :
            'bg-blue-50 text-blue-700'
          }`}>
            {asg.status === 'done' && <CheckCircle size={12} />}
            {asg.status === 'done' ? 'הושלם' : asg.status === 'overdue' ? 'באיחור' : 'ממתין'}
          </div>
        </div>

        {/* Attachments */}
        {attachmentsWithUrls.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
              <Paperclip size={12} />
              קבצים מצורפים
            </p>
            <ul className="space-y-1.5">
              {attachmentsWithUrls.map((a) => (
                <li key={a.id}>
                  {a.downloadUrl ? (
                    <a href={a.downloadUrl} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                      <FileText size={14} />
                      {a.fileName}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">{a.fileName}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Existing submission */}
        {submission && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">ההגשה שלך</p>
            {submission.note && (
              <p className="text-sm text-foreground">{submission.note}</p>
            )}
            {submission.fileName && submissionFileUrl && (
              <a href={submissionFileUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <Paperclip size={14} />
                {submission.fileName}
              </a>
            )}
            {submission.score != null && (
              <div className="bg-green-50 rounded p-3">
                <p className="text-sm font-semibold text-green-700">ציון: {submission.score}/100</p>
                {submission.feedback && (
                  <p className="text-sm text-gray-600 mt-1">{submission.feedback}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Submission form (only if pending/overdue and not yet graded) */}
        {asg.status !== 'done' && (!submission || submission.score == null) && (
          <PortalSubmissionForm action={boundAction} hasExisting={!!submission} />
        )}
      </main>

      <PortalTabBar orgId={orgId} active="homework" />
    </div>
  )
}
