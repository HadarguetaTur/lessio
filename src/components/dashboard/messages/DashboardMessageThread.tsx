'use client'

import { useActionState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import type { PortalMessage } from '@/lib/portal/messages'

type Props = {
  messages: PortalMessage[]
  replyAction: (prev: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}

export function DashboardMessageThread({ messages, replyAction }: Props) {
  const [state, action, isPending] = useActionState(replyAction, { error: null })
  const scrollRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  useEffect(() => {
    if (state.error === null && formRef.current) {
      formRef.current.reset()
    }
  }, [state])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[600px]">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            אין הודעות בשיחה זו.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.isFromParent ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[70%] rounded-xl px-4 py-2.5 ${
                msg.isFromParent
                  ? 'bg-muted text-foreground rounded-es-sm'
                  : 'bg-primary text-primary-foreground rounded-ee-sm'
              }`}
            >
              <p className={`text-[10px] font-medium mb-0.5 ${
                msg.isFromParent ? 'text-muted-foreground' : 'opacity-70'
              }`}>
                {msg.senderName}
              </p>
              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
              <p className={`text-[10px] mt-1 ${
                msg.isFromParent ? 'text-muted-foreground' : 'opacity-70'
              }`}>
                {new Date(msg.createdAt).toLocaleString('he-IL', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Reply input */}
      <div className="border-t border-border p-4">
        {state.error && (
          <p className="text-xs text-red-600 mb-2">{state.error}</p>
        )}
        <form ref={formRef} action={action} className="flex gap-2">
          <input
            type="text"
            name="body"
            required
            maxLength={2000}
            placeholder="כתבו תגובה..."
            className="flex-1 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 px-4 py-2.5 flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send size={14} />
            שלח
          </button>
        </form>
      </div>
    </div>
  )
}
