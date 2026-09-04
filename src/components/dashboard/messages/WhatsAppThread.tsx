'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { DateTime } from 'luxon'
import { Bot, Send, Sparkles, Undo2 } from 'lucide-react'
import type { ThreadMessage } from '@/lib/whatsapp/conversations'

type ActionResult = { error: string | null }

type Props = {
  messages: ThreadMessage[]
  timezone: string
  /** Meta's 24h window: free text is only deliverable while it is open. */
  windowOpen: boolean
  takenOver: boolean
  sendAction: (prev: ActionResult, formData: FormData) => Promise<ActionResult>
  releaseAction: () => Promise<ActionResult>
}

export function WhatsAppThread({
  messages,
  timezone,
  windowOpen,
  takenOver,
  sendAction,
  releaseAction,
}: Props) {
  const t = useTranslations('waConversations')
  const tCommon = useTranslations('common')
  const [state, action, isPending] = useActionState(sendAction, { error: null })
  const [releasing, startRelease] = useTransition()
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Controlled, so a failed send keeps what was typed. React 19 resets an
  // uncontrolled form after any action completes, success or not, which
  // defeated the guard that used to sit on formRef.reset().
  const [body, setBody] = useState('')

  // Adjusted during render rather than in an effect: useActionState returns the
  // same object until an action resolves, so a changed identity means a send
  // just settled, and only a clean one should empty the box.
  const [settled, setSettled] = useState(state)
  if (state !== settled) {
    setSettled(state)
    if (state.error === null) setBody('')
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[600px]">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.isInbound ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[70%] rounded-xl px-4 py-2.5 ${bubbleClasses(msg)}`}
            >
              {!msg.isInbound && (
                <p className="text-[11px] font-medium mb-0.5 flex items-center gap-1 opacity-90">
                  {msg.origin === 'ai' && <Sparkles size={10} />}
                  {(msg.origin === 'bot' || msg.origin === 'cron') && <Bot size={10} />}
                  {msg.origin === 'staff'
                    ? (msg.senderName ?? t('origins.staff'))
                    : t(`origins.${msg.origin ?? 'bot'}`)}
                </p>
              )}
              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
              <p className="text-[11px] mt-1 opacity-90">
                {DateTime.fromISO(msg.createdAt).setZone(timezone).toFormat('dd/MM HH:mm')}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-4 space-y-2">
        {takenOver && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{t('takeoverNotice')}</span>
            <button
              type="button"
              disabled={releasing}
              onClick={() =>
                startRelease(async () => {
                  const result = await releaseAction()
                  setReleaseError(result.error)
                })
              }
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <Undo2 size={12} />
              {t('actions.release')}
            </button>
          </div>
        )}

        {(state.error || releaseError) && (
          <p className="text-xs text-red-600">{state.error ?? releaseError}</p>
        )}

        {windowOpen ? (
          <form action={action} className="flex gap-2">
            <input
              type="text"
              name="body"
              required
              maxLength={4096}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('composerPlaceholder')}
              className="flex-1 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isPending}
              className="shrink-0 px-4 py-2.5 flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send size={14} />
              {tCommon('actions.send')}
            </button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2.5">
            {t('windowClosedNotice')}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Three voices in one thread: the person on WhatsApp, a colleague, and the
 * system. A staff reply looks like the outgoing message it is; anything the
 * bot or the assistant sent is muted, so an owner scanning a conversation can
 * tell at a glance which answers a person stands behind.
 */
function bubbleClasses(msg: ThreadMessage): string {
  if (msg.isInbound) return 'bg-muted text-foreground rounded-es-sm'
  if (msg.origin === 'staff') return 'bg-primary text-primary-foreground rounded-ee-sm'
  return 'bg-secondary text-secondary-foreground rounded-ee-sm'
}
