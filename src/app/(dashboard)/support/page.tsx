import Link from 'next/link'
import { getTranslations, getFormatter } from 'next-intl/server'
import { LifeBuoy } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getSession } from '@/lib/auth/session'
import { listTicketsForOrg } from '@/lib/support/tickets'
import { SupportStatusBadge } from '@/components/dashboard/support/SupportStatusBadge'

export default async function SupportTicketsPage() {
  const t = await getTranslations('support.list')
  const session = await getSession()
  const format = await getFormatter()
  const tickets = await listTicketsForOrg(session.orgId)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('title')} subtitle={t('description')} />

      {tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title={t('emptyTitle')} subtitle={t('emptySubtitle')} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/support/${ticket.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('meta', {
                      count: ticket.message_count,
                      date: format.dateTime(new Date(ticket.last_message_at), {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }),
                    })}
                  </p>
                </div>
                <SupportStatusBadge status={ticket.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
