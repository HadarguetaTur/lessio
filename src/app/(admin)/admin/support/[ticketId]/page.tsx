import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getFormatter } from 'next-intl/server'
import { ArrowLeft } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { getTicketWithMessages } from '@/lib/support/tickets'
import { getTicketContext } from '@/lib/superadmin/supportTickets'
import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { SupportThread } from '@/components/dashboard/support/SupportThread'
import { SupportReplyForm } from '@/components/dashboard/support/SupportReplyForm'
import { SupportStatusBadge } from '@/components/dashboard/support/SupportStatusBadge'
import { TicketSeverityBadge } from '@/components/admin/TicketSeverityBadge'
import { TicketStatusControls } from '@/components/admin/TicketStatusControls'
import { LinkDevIssueControl } from '@/components/admin/LinkDevIssueControl'
import { DevIssueStatusBadge } from '@/components/admin/DevIssueStatusBadge'
import { listDevIssues, getDevIssue } from '@/lib/superadmin/devIssues'
import { linkTicketToIssueAction } from '../../dev-issues/actions'
import { replyToTicketAction, setTicketStatusAction } from '../actions'

export default async function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  await requireSuperAdminSession()
  const { ticketId } = await params
  const t = await getTranslations('admin.support')
  const format = await getFormatter()

  const thread = await getTicketWithMessages(ticketId)
  if (!thread) notFound()

  const [context, openIssues, linkedIssue] = await Promise.all([
    getTicketContext(thread.ticket),
    listDevIssues('open', 50),
    thread.ticket.dev_issue_id ? getDevIssue(thread.ticket.dev_issue_id) : Promise.resolve(null),
  ])

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-y-auto">
      <Link
        href="/admin/support"
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>

      <AdminHeader title={thread.ticket.subject} />

      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <Fact label={t('fields.org')}>
          <Link
            href={`/admin/orgs/${thread.ticket.organization_id}`}
            className="text-indigo-600 hover:underline"
          >
            {context.organization_name}
          </Link>
        </Fact>
        <Fact label={t('fields.reporter')}>
          {context.reporter_name ?? '—'}
          {context.reporter_phone ? (
            <span className="block font-mono text-xs text-muted-foreground">
              {context.reporter_phone}
            </span>
          ) : null}
        </Fact>
        <Fact label={t('fields.opened')}>
          {format.dateTime(new Date(thread.ticket.created_at), {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </Fact>
        <Fact label={t('fields.source')}>{t(`source.${thread.ticket.source}`)}</Fact>
        <Fact label={t('fields.category')}>
          {thread.ticket.category ? t(`category.${thread.ticket.category}`) : '—'}
        </Fact>
        <Fact label={t('fields.severity')}>
          {thread.ticket.severity ? (
            <TicketSeverityBadge severity={thread.ticket.severity} />
          ) : (
            '—'
          )}
        </Fact>
        {thread.ticket.page_url ? (
          <Fact label={t('fields.page')}>
            <span className="font-mono text-xs break-all">{thread.ticket.page_url}</span>
          </Fact>
        ) : null}
        <Fact label={t('fields.status')}>
          <SupportStatusBadge status={thread.ticket.status} />
        </Fact>
      </dl>

      <div className="mb-6 flex flex-col gap-4">
        <TicketStatusControls
          ticketId={thread.ticket.id}
          current={thread.ticket.status}
          setStatus={setTicketStatusAction}
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('fields.devIssue')}</span>
          {linkedIssue ? (
            <Link
              href={`/admin/dev-issues/${linkedIssue.id}`}
              className="inline-flex items-center gap-2 font-mono text-xs text-indigo-600 hover:underline"
            >
              {linkedIssue.title}
              <DevIssueStatusBadge status={linkedIssue.status} />
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <LinkDevIssueControl
            ticketId={thread.ticket.id}
            currentIssueId={thread.ticket.dev_issue_id ?? null}
            issues={openIssues}
            link={linkTicketToIssueAction}
          />
        </div>
      </div>

      <SupportThread messages={thread.messages} viewer="admin" />

      <div className="mt-4 pb-8">
        <SupportReplyForm
          ticketId={thread.ticket.id}
          reply={replyToTicketAction}
          placeholderKey="adminPlaceholder"
        />
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  )
}
