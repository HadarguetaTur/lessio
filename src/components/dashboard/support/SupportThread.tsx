'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { SupportTicketMessage } from '@/lib/support/tickets'

/**
 * The message thread on a ticket, shared by the customer and admin views.
 *
 * Customer messages sit on the start side, everything from our side (operator,
 * AI, system) on the end side — so "who said this" is legible before reading a
 * word, in both RTL and LTR.
 */
export function SupportThread({ messages }: { messages: SupportTicketMessage[] }) {
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
        const fromCustomer = message.author_type === 'customer'
        const isSystem = message.author_type === 'system'

        return (
          <li
            key={message.id}
            className={cn('flex flex-col gap-1', fromCustomer ? 'items-start' : 'items-end')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap',
                fromCustomer && 'border-border bg-card text-foreground',
                message.author_type === 'admin' && 'border-primary/20 bg-primary/5 text-foreground',
                message.author_type === 'ai' && 'border-purple-200 bg-purple-50 text-foreground',
                isSystem && 'border-dashed border-border bg-muted/40 text-muted-foreground'
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
