import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getConversation } from '@/lib/portal/messages'
import { DashboardMessageThread } from '@/components/dashboard/messages/DashboardMessageThread'
import { replyToPortalMessageAction } from './actions'

export default async function DashboardMessageThreadPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const session = await getSession()
  const db = createServiceRoleClient()

  // Get student info
  const { data: student } = await db
    .from('students')
    .select('full_name')
    .eq('id', studentId)
    .eq('organization_id', session.orgId)
    .single()

  const studentName = (student as { full_name: string } | null)?.full_name ?? ''

  // Mark parent messages as read
  await db
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', session.orgId)
    .eq('student_id', studentId)
    .not('sender_parent_id', 'is', null)
    .is('read_at', null)

  const messages = await getConversation(session.orgId, studentId)
  const boundAction = replyToPortalMessageAction.bind(null, studentId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/messages" className="text-muted-foreground hover:text-foreground">
          <ArrowRight size={18} />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">שיחה — {studentName}</h1>
      </div>

      <div className="rounded-lg border bg-card min-h-[500px] flex flex-col">
        <DashboardMessageThread messages={messages} replyAction={boundAction} />
      </div>
    </div>
  )
}
