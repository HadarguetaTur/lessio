'use client'

import { useActionState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import type { PortalMessage } from '@/lib/portal/messages'

type Props = {
  messages: PortalMessage[]
  sendAction: (prev: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'עכשיו'
  if (minutes < 60) return `לפני ${minutes} דק׳`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `לפני ${hours} שע׳`
  const days = Math.floor(hours / 24)
  if (days < 7) return `לפני ${days} ימים`
  return new Date(iso).toLocaleDateString('he-IL')
}

export function PortalMessageThread({ messages, sendAction }: Props) {
  const [state, action, isPending] = useActionState(sendAction, { error: null })
  const scrollRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  // Clear the form on success
  useEffect(() => {
    if (state.error === null && formRef.current) {
      formRef.current.reset()
    }
  }, [state])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            אין הודעות עדיין. שלחו הודעה למורה.
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
                <p className="text-[10px] font-medium opacity-70 mb-0.5">{msg.senderName}</p>
              )}
              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
              <p className={`text-[10px] mt-1 ${msg.isFromParent ? 'opacity-70' : 'text-muted-foreground'}`}>
                {relativeTime(msg.createdAt)}
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
        <form ref={formRef} action={action} className="flex gap-2">
          <input
            type="text"
            name="body"
            required
            maxLength={2000}
            placeholder="כתבו הודעה..."
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}
