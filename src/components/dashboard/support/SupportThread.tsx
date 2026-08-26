'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { SupportTicketMessage } from '@/lib/support/tickets'

/**
 * The message thread on a ticket, shared by the customer and admin views.
 *
 * `viewer` decides which side is "me". It matters because the same thread is
 * read from both ends: on /support the customer's own messages should sit where
 * every messaging app puts yours, and in /admin/support the operator's do. A
 * fixed side would leave one of the two reading their own words as the other
 * party's. Sides are logical (start/end), so RTL mirrors them for free.
 */
export function SupportThread({
  messages,
  viewer = 'customer',
}: {
  messages: SupportTicketMessage[]
  viewer?: 'customer' | 'admin'
}) {
  const t = useTranslations('support.thread')
  const format = useFormatter()

  if (messages.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        {t('empty')}
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message) => {
        const isMine = message.author_type === viewer
        const isSystem = message.author_type === 'system'

        return (
          <li
            key={message.id}
            className={cn('flex flex-col gap-1', isMine ? 'items-end' : 'items-start')}
          >
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed',
                // The square corner points at the speaker.
                isMine
                  ? 'rounded-2xl rounded-ee-md bg-primary text-primary-foreground'
                  : 'rounded-2xl rounded-es-md border border-border bg-card text-foreground',
                message.author_type === 'ai' && 'border-purple-200 bg-purple-50 text-foreground',
                isSystem &&
                  'rounded-2xl border border-dashed bg-muted/40 text-xs text-muted-foreground'
              )}
            >
              {message.body}
            </div>
            <span className="px-1 text-[11px] text-muted-foreground">
              {t(`author.${message.author_type}`)}
              {' · '}
              {format.dateTime(new Date(message.created_at), {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
