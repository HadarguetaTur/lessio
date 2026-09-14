import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getConversationSummaries } from '@/lib/whatsapp/conversations'
import { getWaConnectionState } from '@/lib/whatsapp/connectionState'
import { deliveryFailureReason } from '@/lib/whatsapp/deliveryErrorCopy'
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

  const [conversations, timezone, waState] = await Promise.all([
    getConversationSummaries(session.orgId, teacher ? { teacherId: teacher.id } : {}),
    getOrgTimezone(session.orgId),
    getWaConnectionState(session.orgId),
  ])

  return (
    <div className="space-y-6">
      <LiveRefresh tables={['whatsapp_messages', 'whatsapp_takeovers']} />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <MessagesTabs showPortal={!isTeacher} />

      {conversations.length === 0 ? (
        /*
         * "Conversations will appear once someone writes to your number" was
         * shown whether or not a number existed. For a teacher this is the only
         * WhatsApp surface in the product, so an unconnected org handed them a
         * page that would never populate and never said why (UX audit F16).
         * The owner gets the fix; everyone else gets the explanation.
         */
        <EmptyState
          icon={MessageSquare}
          title={
            waState.state === 'not_connected'
              ? t('emptyNotConnectedTitle')
              : waState.state === 'reconnect_required'
                ? t('emptyReconnectTitle')
                : t('emptyTitle')
          }
          subtitle={
            waState.state === 'not_connected' || waState.state === 'reconnect_required'
              ? session.role === 'owner'
                ? t('emptyNotConnectedOwner')
                : t('emptyNotConnectedStaff')
              : t('emptySubtitle')
          }
          action={
            session.role === 'owner' &&
            (waState.state === 'not_connected' || waState.state === 'reconnect_required') ? (
              <Link
                href="/settings/whatsapp"
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                {t('emptyNotConnectedAction')}
              </Link>
            ) : undefined
          }
        />
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
                    {/* First: a message that never arrived is the thing to act
                        on. The reason sits in the thread, one click away. */}
                    {c.lastDeliveryFailed && (() => {
                      const reason = deliveryFailureReason(c.lastDeliveryError)
                      return (
                        <Badge
                          variant="destructive"
                          title={reason ? t(`delivery.reasons.${reason}`) : undefined}
                        >
                          {t('delivery.failed')}
                        </Badge>
                      )
                    })()}
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
