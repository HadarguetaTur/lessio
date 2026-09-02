import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getPortalSession } from '@/lib/portal/session'
import { requirePortalFeature } from '@/lib/portal/features'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getConversation, markConversationRead } from '@/lib/portal/messages'
import { PortalTabBar } from '@/components/portal/PortalTabBar'
import { PortalMessageThread } from '@/components/portal/PortalMessageThread'
import { PollingRefresh } from '@/lib/realtime/PollingRefresh'
import { sendMessageAction } from './actions'

export default async function PortalMessageThreadPage({
  params,
}: {
  params: Promise<{ orgId: string; studentId: string }>
}) {
  const { orgId, studentId } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }
  await requirePortalFeature(orgId, 'messages')

  const t = await getTranslations('portal.messages')

  // Verify parent owns this student
  const db = createServiceRoleClient()
  const { data: rel } = await db
    .from('relationships')
    .select('id, students ( full_name )')
    .eq('parent_id', session.parentId)
    .eq('student_id', studentId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!rel) notFound()

  type RelRow = { id: string; students: { full_name: string } | null }
  const studentName = (rel as unknown as RelRow).students?.full_name ?? ''

  // Mark teacher messages as read
  await markConversationRead(orgId, studentId)

  const messages = await getConversation(orgId, studentId)
  const boundAction = sendMessageAction.bind(null, orgId, studentId)

  return (
    <div className="flex flex-col flex-1 pb-20">
      <PollingRefresh intervalMs={15_000} />
      <header className="px-4 py-3.5 border-b border-border bg-card flex items-center gap-3">
        <Link
          href={`/portal/${orgId}/messages`}
          aria-label={t('backToList')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} className="rtl:rotate-180" aria-hidden />
        </Link>
        <h1 className="font-semibold text-foreground text-sm">{studentName}</h1>
      </header>

      <PortalMessageThread
        messages={messages}
        sendAction={boundAction}
        draftKey={`portal-draft:${orgId}:${studentId}`}
      />

      <PortalTabBar orgId={orgId} active="messages" />
    </div>
  )
}
