import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getFormatter } from 'next-intl/server'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { getDevIssue, getLinkedTickets, getRecentEvents } from '@/lib/superadmin/devIssues'
import { DevIssueStatusBadge } from '@/components/admin/DevIssueStatusBadge'
import { DevIssueStatusControls } from '@/components/admin/DevIssueStatusControls'
import { SupportStatusBadge } from '@/components/dashboard/support/SupportStatusBadge'
import type { TicketStatus } from '@/lib/support/tickets'
import { setDevIssueStatusAction } from '../actions'

export default async function AdminDevIssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>
}) {
  await requireSuperAdminSession()
  const { issueId } = await params
  const t = await getTranslations('admin.devIssues')
  const format = await getFormatter()

  const issue = await getDevIssue(issueId)
  if (!issue) notFound()

  const [tickets, events] = await Promise.all([
    getLinkedTickets(issue.id),
    issue.fingerprint ? getRecentEvents(issue.fingerprint) : Promise.resolve([]),
  ])

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-y-auto pb-8">
      <Link
        href="/admin/dev-issues"
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>

      <AdminHeader title={issue.title} />

      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <Fact label={t('fields.status')}>
          <DevIssueStatusBadge status={issue.status} />
        </Fact>
        <Fact label={t('fields.events')}>{issue.event_count}</Fact>
        <Fact label={t('fields.orgs')}>{issue.org_count}</Fact>
        <Fact label={t('fields.firstSeen')}>
          {issue.first_seen
            ? format.dateTime(new Date(issue.first_seen), { dateStyle: 'short', timeStyle: 'short' })
            : '—'}
        </Fact>
        <Fact label={t('fields.lastSeen')}>
          {issue.last_seen
            ? format.dateTime(new Date(issue.last_seen), { dateStyle: 'short', timeStyle: 'short' })
            : '—'}
        </Fact>
        <Fact label={t('fields.fingerprint')}>
          <span className="font-mono text-xs">{issue.fingerprint ?? '—'}</span>
        </Fact>
        {issue.github_issue_url ? (
          <Fact label={t('fields.github')}>
            <a
              href={issue.github_issue_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
            >
              #{issue.github_issue_number}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </Fact>
        ) : null}
      </dl>

      <div className="mb-6">
        <DevIssueStatusControls
          issueId={issue.id}
          current={issue.status}
          setStatus={setDevIssueStatusAction}
        />
      </div>

      {issue.sample_stack ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">{t('sampleStack')}</h2>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed"
          >
            {issue.sample_stack}
          </pre>
        </section>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          {t('linkedTickets', { count: tickets.length })}
        </h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noLinkedTickets')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/admin/support/${ticket.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">{ticket.organization_name}</p>
                  </div>
                  <SupportStatusBadge status={ticket.status as TicketStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {events.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">{t('recentEvents')}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card text-xs">
            {events.map((event) => (
              <li key={event.id} className="px-4 py-2">
                <span className="text-muted-foreground">
                  {format.dateTime(new Date(event.created_at), {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  })}
                </span>
                {event.route ? <span className="ms-2 font-mono">{event.route}</span> : null}
                <span className="ms-2 text-muted-foreground">{event.source}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
