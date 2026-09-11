'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { DateTime } from 'luxon'
import { AlertCircle, Bot, Check, CheckCheck, Megaphone, Send, Sparkles } from 'lucide-react'
import type { ThreadMessage } from '@/lib/whatsapp/conversations'
import { deliveryFailureReason } from '@/lib/whatsapp/deliveryErrorCopy'

type ActionResult = { error: string | null }

type Props = {
  messages: ThreadMessage[]
  timezone: string
  /** Meta's 24h window: free text is only deliverable while it is open. */
  windowOpen: boolean
  takenOver: boolean
  sendAction: (prev: ActionResult, formData: FormData) => Promise<ActionResult>
  /**
   * What replaces the text box once Meta's window has closed. The thread used
   * to show a dead sentence there; the inbox passes a composer that sends an
   * approved template instead, or an explanation where no template applies.
   */
  closedWindow: React.ReactNode
}

export function WhatsAppThread({
  messages,
  timezone,
  windowOpen,
  takenOver,
  sendAction,
  closedWindow,
}: Props) {
  const t = useTranslations('waConversations')
  const tCommon = useTranslations('common')
  const tInbox = useTranslations('inbox.thread')
  const [state, action, isPending] = useActionState(sendAction, { error: null })
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.isInbound ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[70%] rounded-xl px-4 py-2.5 ${bubbleClasses(msg)}`}
            >
              {!msg.isInbound && (
                <p className="text-[11px] font-medium mb-0.5 flex items-center gap-1 opacity-90">
                  {msg.origin === 'ai' && <Sparkles size={10} />}
                  {(msg.origin === 'bot' || msg.origin === 'cron') && <Bot size={10} />}
                  {msg.origin === 'broadcast' && <Megaphone size={10} />}
                  {msg.origin === 'staff'
                    ? (msg.senderName ?? t('origins.staff'))
                    : t(`origins.${msg.origin ?? 'bot'}`)}
                </p>
              )}
              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
              <p className="text-[11px] mt-1 opacity-90 flex items-center gap-1.5">
                <span>
                  {DateTime.fromISO(msg.createdAt).setZone(timezone).toFormat('dd/MM HH:mm')}
                </span>
                {!msg.isInbound && msg.deliveryStatus && (
                  <DeliveryMark status={msg.deliveryStatus} errorCode={msg.errorCode} />
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-4 space-y-2">
        {state.error && (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
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
          closedWindow
        )}

        {windowOpen && !takenOver && (
          // Sending a reply silences the bot here for six hours. That used to
          // happen with no warning at all.
          <p className="text-[11px] text-muted-foreground">{tInbox('sendTakesOver')}</p>
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

/**
 * WhatsApp's own vocabulary: one tick accepted, two delivered, two (solid) read.
 * A failure names Meta's code, because the code is what tells an owner whether
 * the number is wrong (131026), the window closed (131047) or a template is
 * missing (132001) — and it is what support will ask for.
 */
function DeliveryMark({
  status,
  errorCode,
}: {
  status: NonNullable<ThreadMessage['deliveryStatus']>
  errorCode: number | null
}) {
  const t = useTranslations('waConversations')

  if (status === 'failed') {
    // Meta's numeric code is precise and useless to whoever is reading the
    // inbox: 131047 means "the parent hasn't written in 24 hours", which is the
    // one failure that is nobody's fault (UX audit F18). Unmapped codes stay a
    // plain "failed" — the number is in the logs either way.
    const reason = deliveryFailureReason(errorCode)
    return (
      <span className="inline-flex items-center gap-0.5 text-red-600 font-medium">
        <AlertCircle size={11} aria-hidden />
        {reason ? t(`delivery.reasons.${reason}`) : t('delivery.failed')}
      </span>
    )
  }
  if (status === 'read') return <CheckCheck size={12} aria-label={t('delivery.read')} />
  if (status === 'delivered') {
    return <CheckCheck size={12} aria-label={t('delivery.delivered')} className="opacity-60" />
  }
  return <Check size={12} aria-label={t('delivery.sent')} className="opacity-60" />
}
