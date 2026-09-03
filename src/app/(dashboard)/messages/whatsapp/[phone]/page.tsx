import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
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
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { WhatsAppThread } from '@/components/dashboard/messages/WhatsAppThread'
import { Badge } from '@/components/ui/badge'
import { releaseTakeoverAction, sendStaffMessageAction } from './actions'

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

  const sendAction = sendStaffMessageAction.bind(null, phone)
  const releaseAction = releaseTakeoverAction.bind(null, phone)

  return (
    <div className="space-y-4">
      <LiveRefresh tables={['whatsapp_messages', 'whatsapp_takeovers']} />

      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/messages/whatsapp"
          aria-label={t('backToList')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowRight size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {header.displayName ?? phone}
          </h1>
          <p className="text-xs text-muted-foreground">
            {header.displayName ? `${phone} · ` : ''}
            {t(`roles.${header.senderRole}`)}
          </p>
        </div>
        {header.takenOver && (
          <Badge variant="secondary">
            {header.takenOverBy
              ? t('badges.takenOverBy', { name: header.takenOverBy })
              : t('badges.takenOver')}
          </Badge>
        )}
      </div>

      <div className="rounded-lg border bg-card min-h-[500px] flex flex-col">
        <WhatsAppThread
          messages={messages}
          timezone={timezone}
          windowOpen={windowOpen}
          takenOver={header.takenOver}
          sendAction={sendAction}
          releaseAction={releaseAction}
        />
      </div>
    </div>
  )
}
