import { notFound } from 'next/navigation'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeacherByProfileId } from '@/lib/teachers'
import {
  canTeacherAccessPhone,
  getConversationHeader,
  getThread,
} from '@/lib/whatsapp/conversations'
import { isInSessionWindow } from '@/lib/whatsapp/sendSmart'
import { PARAM_LIMITS } from '@/lib/whatsapp/approvedTemplates'
import { deriveTags } from '@/lib/inbox/tags'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { WhatsAppThread } from '@/components/dashboard/messages/WhatsAppThread'
import { ThreadHeader } from '@/components/inbox/ThreadHeader'
import { TakeoverToggle } from '@/components/inbox/TakeoverToggle'
import { ClosedWindowComposer } from '@/components/inbox/ClosedWindowComposer'
import {
  releaseTakeoverAction,
  sendClassUpdateToOneAction,
  sendStaffMessageAction,
  takeOverConversationAction,
} from './actions'

/**
 * One WhatsApp conversation, in the right pane of the inbox.
 *
 * The header carries the decision the old page never offered — "I am handling
 * this" — and the bottom of the thread always offers a way to reach the person,
 * even after Meta's window has closed.
 */
export default async function WhatsAppThreadPage({
  params,
}: {
  params: Promise<{ phone: string }>
}) {
  const t = await getTranslations('waConversations')
  const { phone: rawPhone } = await params
  const phone = decodeURIComponent(rawPhone)
  const session = await getSession()

  if (session.role === 'teacher') {
    const teacher = await getTeacherByProfileId(session.profileId, session.orgId, {
      activeOnly: true,
    })
    // A phone number in a URL is client input: the list is filtered, and so is
    // this, or typing any number would open any conversation in the org.
    if (!teacher || !(await canTeacherAccessPhone(session.orgId, teacher.id, phone))) {
      notFound()
    }
  }

  const [messages, header, windowOpen, timezone] = await Promise.all([
    getThread(session.orgId, phone),
    getConversationHeader(session.orgId, phone),
    isInSessionWindow(session.orgId, phone),
    getOrgTimezone(session.orgId),
  ])

  if (messages.length === 0) notFound()

  const last = messages[messages.length - 1]
  const tags = deriveTags(
    {
      channel: 'whatsapp',
      key: `wa:${phone}`,
      href: `/messages/whatsapp/${encodeURIComponent(phone)}`,
      phone,
      displayName: header.displayName,
      fallbackLabel: phone,
      senderRole: header.senderRole,
      lastMessage: last.body,
      lastMessageAt: last.createdAt,
      awaitingReply: last.isInbound,
      takenOver: header.takenOver,
      takenOverBy: header.takenOverBy,
      takenOverByProfileId: header.takenOverByProfileId,
      lastOrigin: last.origin,
      lastInbound: last.isInbound,
      lastDeliveryStatus: last.deliveryStatus,
      lastErrorCode: last.errorCode,
      windowOpen,
      parentId: header.parentId,
      studentNames: header.studentNames,
      teacherNames: [],
      groupNames: [],
      optedOut: header.optedOut,
      hasOpenDebt: false,
    },
    session.profileId
  )

  const heldUntil = header.takenOverUntil
    ? DateTime.fromISO(header.takenOverUntil).setZone(timezone).toFormat('HH:mm')
    : null

  const subtitle = [
    header.displayName ? phone : null,
    t(`roles.${header.senderRole}`),
    header.studentNames.length > 0 ? header.studentNames.join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div data-thread className="flex h-full min-h-0 flex-col">
      <LiveRefresh tables={['whatsapp_messages', 'whatsapp_takeovers']} />

      <ThreadHeader
        title={header.displayName ?? phone}
        subtitle={subtitle}
        tags={tags}
        actions={
          <TakeoverToggle
            takenOver={header.takenOver}
            takenOverBy={header.takenOverBy}
            takenOverUntil={heldUntil}
            takeAction={takeOverConversationAction.bind(null, phone)}
            releaseAction={releaseTakeoverAction.bind(null, phone)}
          />
        }
      />

      <WhatsAppThread
        messages={messages}
        timezone={timezone}
        windowOpen={windowOpen}
        takenOver={header.takenOver}
        sendAction={sendStaffMessageAction.bind(null, phone)}
        closedWindow={
          <ClosedWindowComposer
            blocked={!header.parentId ? 'not_parent' : header.optedOut ? 'opted_out' : null}
            sendAction={sendClassUpdateToOneAction.bind(null, phone)}
            messageMax={PARAM_LIMITS.broadcast_message}
            topicMax={PARAM_LIMITS.broadcast_topic}
          />
        }
      />
    </div>
  )
}
