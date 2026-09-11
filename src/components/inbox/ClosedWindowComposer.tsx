'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Megaphone, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Result = { error: string | null; guardReason?: string; sent?: boolean }

/**
 * What the thread offers once Meta's 24h window has closed.
 *
 * Free text is illegal then, and the composer used to simply vanish behind a
 * sentence saying so — at exactly the moment an owner most needs to reach a
 * parent ("tomorrow's lesson is moved"). For a parent this sends the message as
 * an approved service update instead. For anyone else no template applies, so
 * it says so, and says when they will be reachable again.
 */
export function ClosedWindowComposer({
  blocked,
  sendAction,
  messageMax,
  topicMax,
}: {
  /**
   * Why nothing can be sent, when nothing can. The update template is
   * addressed to parents, and a parent who asked to stop is not sent one.
   */
  blocked: 'not_parent' | 'opted_out' | null
  sendAction: (prev: Result, formData: FormData) => Promise<Result>
  messageMax: number
  topicMax: number
}) {
  const t = useTranslations('inbox.thread')
  const tBlocked = useTranslations('broadcasts.blocked')
  const [state, action, pending] = useActionState(sendAction, { error: null })
  const [message, setMessage] = useState('')
  const flattened = message.replace(/\s+/g, ' ').trim()
  const tooLong = flattened.length > messageMax

  if (blocked) {
    return (
      <div className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <Clock size={14} aria-hidden className="mt-0.5 shrink-0" />
        <p>
          <span className="font-medium text-foreground">{t('windowClosedTitle')}</span>{' '}
          {blocked === 'opted_out' ? t('windowClosedOptedOut') : t('windowClosedOther')}
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex gap-2 text-xs text-muted-foreground">
        <Clock size={14} aria-hidden className="mt-0.5 shrink-0" />
        <p>
          <span className="font-medium text-foreground">{t('windowClosedTitle')}</span>{' '}
          {t('windowClosedParent')}
        </p>
      </div>

      <input
        name="topic"
        maxLength={topicMax}
        placeholder={t('topicPlaceholder')}
        aria-label={t('topicPlaceholder')}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <textarea
        name="message"
        required
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('updatePlaceholder')}
        aria-label={t('updatePlaceholder')}
        aria-describedby="closed-window-count"
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="flex items-center justify-between gap-3">
        <span
          id="closed-window-count"
          className={`text-[11px] ${tooLong ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {flattened.length}/{messageMax}
        </span>
        <Button type="submit" size="sm" disabled={pending || tooLong || flattened.length === 0}>
          <Megaphone size={14} aria-hidden />
          {t('sendUpdate')}
        </Button>
      </div>

      {state.sent && (
        <p role="status" className="text-xs text-green-700 dark:text-green-400">
          {t('updateSent')}
        </p>
      )}
      {state.guardReason && (
        <p role="alert" className="text-xs text-destructive">
          {tBlocked(state.guardReason)}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}
