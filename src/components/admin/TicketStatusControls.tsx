'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { TicketStatus } from '@/lib/support/tickets'

const STATUSES: TicketStatus[] = [
  'open',
  'in_progress',
  'waiting_on_customer',
  'resolved',
  'closed',
]

type SetStatusAction = (
  prev: { error: string | null } | null,
  formData: FormData
) => Promise<{ error: string | null }>

/**
 * One button per status, current one disabled. A dropdown would be tidier, but
 * there is no select primitive in this codebase and five buttons is one click
 * to any state instead of two.
 */
export function TicketStatusControls({
  ticketId,
  current,
  setStatus,
}: {
  ticketId: string
  current: TicketStatus
  setStatus: SetStatusAction
}) {
  const t = useTranslations('support.status')
  const ta = useTranslations('admin.support')
  const [state, formAction, pending] = useActionState(setStatus, null)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <span className="text-xs text-muted-foreground">{ta('changeStatus')}</span>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((status) => (
          <Button
            key={status}
            type="submit"
            name="status"
            value={status}
            size="sm"
            variant={status === current ? 'default' : 'outline'}
            disabled={pending || status === current}
          >
            {t(status)}
          </Button>
        ))}
      </div>
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  )
}
