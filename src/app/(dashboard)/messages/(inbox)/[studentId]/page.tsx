import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getConversation } from '@/lib/portal/messages'
import { getTeacherByProfileId } from '@/lib/teachers'
import { canTeacherAccessStudent } from '@/lib/students'
import { DashboardMessageThread } from '@/components/dashboard/messages/DashboardMessageThread'
import { ThreadHeader } from '@/components/inbox/ThreadHeader'
import { replyToPortalMessageAction } from './actions'

/**
 * A portal conversation, in the same right pane as a WhatsApp one.
 *
 * Portal threads have no bot, no 24h window and no takeover — a parent wrote
 * from the personal area and a person answers — so the header carries only who
 * it is and the channel tag.
 */
export default async function PortalThreadPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const t = await getTranslations()
  const { studentId } = await params
  const session = await getSession()

  // Teachers reach this through the inbox rail now. The student id is client
  // input, so their scope is enforced here as well as in the list.
  if (session.role === 'teacher') {
    const teacher = await getTeacherByProfileId(session.profileId, session.orgId, {
      activeOnly: true,
    })
    if (!teacher || !(await canTeacherAccessStudent(session.orgId, teacher.id, studentId))) {
      notFound()
    }
  }

  const db = createServiceRoleClient()
  const { data: student } = await db
    .from('students')
    .select('full_name')
    .eq('id', studentId)
    .eq('organization_id', session.orgId)
    .maybeSingle()

  if (!student) notFound()
  const studentName = (student as { full_name: string }).full_name ?? ''

  // Opening the thread is reading it. Kept from the original page, where the
  // unread count this clears is what the inbox calls "awaiting reply".
  await db
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', session.orgId)
    .eq('student_id', studentId)
    .not('sender_parent_id', 'is', null)
    .is('read_at', null)

  const messages = await getConversation(session.orgId, studentId)

  return (
    <div data-thread className="flex h-full min-h-0 flex-col">
      <LiveRefresh tables={['portal_messages']} />
      <ThreadHeader
        title={t('lessons.messagesPage.threadTitle', { name: studentName })}
        subtitle={t('inbox.thread.portalSubtitle')}
        tags={[{ kind: 'static', id: 'portal' }]}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <DashboardMessageThread
          messages={messages}
          replyAction={replyToPortalMessageAction.bind(null, studentId)}
        />
      </div>
    </div>
  )
}
