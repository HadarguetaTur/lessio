import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getConversationSummaries } from '@/lib/whatsapp/conversations'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { MessagesTabs } from '@/components/dashboard/messages/MessagesTabs'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function WhatsAppConversationsPage() {
  const t = await getTranslations('waConversations')
  const session = await getSession()
  const isTeacher = session.role === 'teacher'

  // A teacher sees the conversations of their own students' parents, matching
  // the reach /students already grants them.
  const teacher = isTeacher
    ? await getTeacherByProfileId(session.profileId, session.orgId, { activeOnly: true })
    : null

  if (isTeacher && !teacher) {
    return <p className="text-center mt-16 text-sm text-muted-foreground">{t('noTeacherRecord')}</p>
  }

  const [conversations, timezone] = await Promise.all([
    getConversationSummaries(session.orgId, teacher ? { teacherId: teacher.id } : {}),
    getOrgTimezone(session.orgId),
  ])

  return (
    <div className="space-y-6">
      <LiveRefresh tables={['whatsapp_messages', 'whatsapp_takeovers']} />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <MessagesTabs showPortal={!isTeacher} />

      {conversations.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t('emptyTitle')} subtitle={t('emptySubtitle')} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('colContact')}</TableHead>
                <TableHead>{t('colLastMessage')}</TableHead>
                <TableHead>{t('colDate')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((c) => (
                <TableRow key={c.phone}>
                  <TableCell>
                    <Link
                      href={`/messages/whatsapp/${encodeURIComponent(c.phone)}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.displayName ?? c.phone}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {c.displayName ? `${c.phone} · ` : ''}
                      {t(`roles.${c.senderRole}`)}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {c.lastMessage.length > 80 ? c.lastMessage.slice(0, 80) + '…' : c.lastMessage}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {DateTime.fromISO(c.lastMessageAt)
                      .setZone(timezone)
                      .toFormat('dd/MM HH:mm')}
                  </TableCell>
                  <TableCell className="space-x-1 space-x-reverse">
                    {c.takenOver && <Badge variant="secondary">{t('badges.takenOver')}</Badge>}
                    {c.awaitingReply && <Badge variant="outline">{t('badges.awaitingReply')}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
