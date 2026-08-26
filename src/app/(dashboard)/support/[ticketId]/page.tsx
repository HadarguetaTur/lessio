import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getFormatter, getLocale } from 'next-intl/server'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { getSession } from '@/lib/auth/session'
import { getTicketWithMessages } from '@/lib/support/tickets'
import { SupportStatusBadge } from '@/components/dashboard/support/SupportStatusBadge'
import { SupportThread } from '@/components/dashboard/support/SupportThread'
import { SupportReplyForm } from '@/components/dashboard/support/SupportReplyForm'
import { replyToTicketAction } from '../actions'

export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params
  const t = await getTranslations('support.detail')
  const session = await getSession()
  const locale = await getLocale()
  const format = await getFormatter()

  // orgId-scoped: another org's ticket is not found, not forbidden.
  const thread = await getTicketWithMessages(ticketId, session.orgId)
  if (!thread) notFound()

  const BackIcon = locale === 'he' ? ArrowRight : ArrowLeft

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/support"
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <BackIcon className="size-4" aria-hidden />
        {t('back')}
      </Link>

      <PageHeader
        title={thread.ticket.subject}
        subtitle={t('opened', {
          date: format.dateTime(new Date(thread.ticket.created_at), {
            dateStyle: 'long',
            timeStyle: 'short',
          }),
        })}
        actions={<SupportStatusBadge status={thread.ticket.status} />}
        className="mb-0"
      />

      <SupportThread messages={thread.messages} />

      {thread.ticket.status === 'closed' ? (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {t('closedNotice')}
        </p>
      ) : (
        <SupportReplyForm ticketId={thread.ticket.id} reply={replyToTicketAction} />
      )}
    </div>
  )
}
