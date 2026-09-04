'use client'

import { useActionState, useRef, useEffect, useState, useSyncExternalStore } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Send } from 'lucide-react'
import type { PortalMessage } from '@/lib/portal/messages'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'

const MAX_BODY = 2000
/** Where the character counter appears — late enough to stay out of the way. */
const COUNTER_FROM = 1800

/** Nothing to subscribe to: the snapshot alone distinguishes server from client. */
const noopSubscribe = () => () => {}
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )

type Props = {
  messages: PortalMessage[]
  sendAction: (prev: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  /** Scopes the saved draft to this thread. */
  draftKey: string
}

/** Absolute, and identical on the server and the client — safe to hydrate. */
function absoluteTime(iso: string, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function relativeTime(iso: string, intlLocale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' })
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  const days = Math.floor(hours / 24)
  if (days < 7) return rtf.format(-days, 'day')
  return new Date(iso).toLocaleDateString(intlLocale)
}

export function PortalMessageThread({ messages, sendAction, draftKey }: Props) {
  const t = useTranslations('portal.messages')
  const intlLocale = toIntlLocale(parseAppLocale(useLocale()))
  const [state, action, isPending] = useActionState(sendAction, { error: null })
  const scrollRef = useRef<HTMLDivElement>(null)

  // Controlled, so a failed send keeps what was typed on screen. React 19
  // resets an uncontrolled form after any action completes, success or not:
  // the draft below survived in sessionStorage, but the box looked empty and
  // nothing told the parent their message was recoverable.
  const [body, setBody] = useState('')

  // "5 minutes ago" depends on when it is read, so the server and the client
  // disagree and React throws away the tree. Render the absolute time on the
  // server and upgrade to relative once we are on the client.
  const mounted = useHydrated()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  // Clear on success only. A failure leaves both the box and the saved draft
  // alone, so the parent can hit send again instead of retyping.
  //
  // Adjusted during render, and keyed on identity rather than a "first run"
  // flag: useActionState hands back the very same initial object until an
  // action resolves, so a changed identity is the only reliable signal that a
  // send actually settled. The old version cleared on mount — which wiped the
  // stored draft before the restore below could read it, so it never came back.
  // A counter, not a boolean derived during render: a render-phase update is
  // discarded and re-run, so anything computed alongside it never reaches an
  // effect. Committed state does, and each increment fires the cleanup once.
  const [settled, setSettled] = useState(state)
  const [sendCount, setSendCount] = useState(0)
  if (state !== settled) {
    setSettled(state)
    if (state.error === null) {
      setBody('')
      setSendCount((n) => n + 1)
    }
  }

  useEffect(() => {
    if (sendCount === 0) return
    try {
      sessionStorage.removeItem(draftKey)
    } catch {
      // Private browsing, or storage disabled — losing a sent draft is fine.
    }
  }, [sendCount, draftKey])

  // A dropped connection sends the whole page to the error boundary, taking an
  // unsent message with it. Restore whatever was typed when the parent returns.
  // sessionStorage cannot be read while rendering on the server, so this is the
  // one place state genuinely has to be seeded from an effect.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setBody(saved)
    } catch {
      // Nothing to restore.
    }
  }, [draftKey])

  function rememberDraft(value: string) {
    setBody(value)
    try {
      if (value) sessionStorage.setItem(draftKey, value)
      else sessionStorage.removeItem(draftKey)
    } catch {
      // The draft is a convenience; never break typing over it.
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('threadEmpty')}
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.isFromParent ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 ${
                msg.isFromParent
                  ? 'bg-primary text-primary-foreground rounded-ee-sm'
                  : 'bg-muted text-foreground rounded-es-sm'
              }`}
            >
              {!msg.isFromParent && (
                <p className="text-[11px] font-medium opacity-90 mb-0.5">{msg.senderName}</p>
              )}
              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
              <p className={`text-[11px] mt-1 ${msg.isFromParent ? 'opacity-90' : 'text-muted-foreground'}`}>
                {mounted
                  ? relativeTime(msg.createdAt, intlLocale)
                  : absoluteTime(msg.createdAt, intlLocale)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-card p-3">
        {state.error && (
          <p className="text-xs text-red-600 mb-2">{state.error}</p>
        )}
        {/* The limit is silent otherwise: paste a long message and 500
            characters vanish with nothing on screen to say so. */}
        {body.length >= COUNTER_FROM && (
          <p className="text-xs text-muted-foreground mb-2 text-end tabular-nums">
            {t('charCount', { count: body.length, max: MAX_BODY })}
          </p>
        )}
        <form action={action} className="flex gap-2">
          <input
            type="text"
            name="body"
            required
            maxLength={MAX_BODY}
            value={body}
            onChange={(e) => rememberDraft(e.target.value)}
            placeholder={t('inputPlaceholder')}
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isPending}
            aria-label={t('send')}
            className="shrink-0 w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send size={16} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  )
}
