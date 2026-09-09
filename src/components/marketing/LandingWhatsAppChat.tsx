'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import type { LandingChatMessage } from '@/lib/marketing/landingCopy'

/**
 * The hero's WhatsApp conversation — the real cancellation flow, replayed.
 * Message content mirrors the actual bot templates (same flow the video mocks
 * in video-assets/whatsapp/01-cancel-flow); nothing here is invented.
 *
 * Rendered as markup rather than a screenshot so it stays crisp at any DPI,
 * localizes with the page, and can replay like a conversation: messages appear
 * one by one once the phone scrolls into view (motion-safe only).
 */
export function LandingWhatsAppChat({
  contactName,
  statusLabel,
  messages,
  className,
}: {
  contactName: string
  statusLabel: string
  messages: readonly LandingChatMessage[]
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [on, setOn] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setOn(true)
          obs.disconnect()
        }
      },
      { threshold: 0.35 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        // Phone frame. Colors are WhatsApp's own, deliberately identical in
        // light and dark theme — it should read as "a real phone", not themed UI.
        'w-full max-w-[21rem] overflow-hidden rounded-[1.75rem] border border-black/10 bg-[#efeae2] shadow-xl shadow-black/10 ring-1 ring-black/5 dark:border-white/10 dark:shadow-black/40',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-sm font-bold leading-none text-white">
          L
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{contactName}</p>
          <p className="text-[0.7rem] text-white/80">{statusLabel}</p>
        </div>
      </div>

      {/* Thread */}
      <div className="flex flex-col gap-2 px-3 py-4">
        {messages.map((msg, i) => {
          const parent = msg.from === 'parent'
          return (
            <div
              key={i}
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2 text-[0.8rem] leading-relaxed shadow-sm',
                parent
                  ? 'self-end rounded-ee-sm bg-[#d9fdd3] text-[#111b21]'
                  : 'self-start rounded-ss-sm bg-white text-[#111b21]',
                !on && 'opacity-0',
                on &&
                  'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-3 motion-safe:duration-500 motion-safe:ease-out motion-safe:fill-mode-both motion-reduce:animate-none motion-reduce:opacity-100'
              )}
              style={on ? { animationDelay: `${350 + i * 650}ms` } : undefined}
            >
              {msg.lines.map((line, j) => (
                <p
                  key={j}
                  className={cn(
                    'text-pretty',
                    j > 0 && 'mt-1',
                    msg.highlight && j === msg.lines.length - 1 && 'font-bold'
                  )}
                >
                  {line}
                </p>
              ))}
              {msg.buttons ? (
                <div className="mt-2 border-t border-black/5 pt-1.5">
                  {msg.buttons.map((label) => (
                    <p
                      key={label}
                      className="py-1 text-center text-[0.78rem] font-medium text-[#0a7cff]"
                    >
                      {label}
                    </p>
                  ))}
                </div>
              ) : null}
              <p className={cn('mt-1 text-[0.62rem] text-[#667781]', parent ? 'text-start' : 'text-end')}>
                {msg.time}
                {parent ? <span className="ms-1 text-[#53bdeb]">✓✓</span> : null}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
