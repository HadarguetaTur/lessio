'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { TicketStatus } from '@/lib/support/tickets'

/**
 * Ticket status pill.
 *
 * Deliberately separate from `ui/status-badge`: that component's status map is
 * keyed by DB values from the org's own domain (lessons, charges, leads), and
 * 'open' / 'closed' / 'in_progress' already mean different things there. Sharing
 * the map would make a lead status and a ticket status render the same word.
 */
const STATUS_CLASS: Record<TicketStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
  waiting_on_customer: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
}

export function SupportStatusBadge({
  status,
  className,
}: {
  status: TicketStatus
  className?: string
}) {
  const t = useTranslations('support.status')

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        STATUS_CLASS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
        className
      )}
    >
      {t(status)}
    </span>
  )
}
