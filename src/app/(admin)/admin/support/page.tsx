import Link from 'next/link'
import { getTranslations, getFormatter } from 'next-intl/server'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { listTicketsForAdmin, type QueueFilter } from '@/lib/superadmin/supportTickets'
import { SupportStatusBadge } from '@/components/dashboard/support/SupportStatusBadge'
import { TicketSeverityBadge } from '@/components/admin/TicketSeverityBadge'
import { cn } from '@/lib/utils'

const FILTERS: QueueFilter[] = ['open', 'resolved', 'closed', 'all']

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const t = await getTranslations('admin.support')
  const format = await getFormatter()

  const active: QueueFilter = FILTERS.includes(filter as QueueFilter)
    ? (filter as QueueFilter)
    : 'open'
  const tickets = await listTicketsForAdmin(active)

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden">
      <AdminHeader title={t('title')} description={t('description')} />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('filterLabel')}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'open' ? '/admin/support' : `/admin/support?filter=${f}`}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active === f
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            )}
          >
            {t(`filter.${f}`)}
          </Link>
        ))}
      </nav>

      {tickets.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/admin/support/${ticket.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ticket.organization_name}
                    {ticket.reporter_name ? ` · ${ticket.reporter_name}` : ''}
                    {' · '}
                    {t(`source.${ticket.source}`)}
                    {' · '}
                    {format.dateTime(new Date(ticket.created_at), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {ticket.severity ? <TicketSeverityBadge severity={ticket.severity} /> : null}
                  <SupportStatusBadge status={ticket.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
