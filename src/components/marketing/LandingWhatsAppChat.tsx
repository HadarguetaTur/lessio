import { cn } from '@/lib/utils'
import type { LandingChatMessage } from '@/lib/marketing/landingCopy'

/**
 * The parent's WhatsApp exchange, the real cancellation flow verbatim, shown
 * as a printout clipped into the diary. WhatsApp's own colours are kept so it
 * reads as the phone the parent held, not as themed UI. Static by design: the
 * page's one motion is the pen on the spread.
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
  return (
    <div className={cn('wa w-full', className)}>
      <div className="wa-head flex items-center gap-2.5 px-3 py-1.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-xs font-bold leading-none text-white">
          L
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[0.8rem] font-semibold">{contactName}</p>
          <p className="text-[0.62rem] text-white/80">{statusLabel}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1 px-2.5 py-2">
        {messages.map((msg, i) => {
          const parent = msg.from === 'parent'
          return (
            <div
              key={i}
              className={cn(
                'wa-bubble max-w-[88%] rounded-lg px-2.5 py-1 text-[0.72rem] leading-snug',
                parent ? 'mine self-end' : 'self-start'
              )}
            >
              {msg.lines.map((line, j) => (
                <p key={j} className={cn(j > 0 && 'mt-0.5', msg.highlight && j === msg.lines.length - 1 && 'font-bold')}>
                  {msg.highlight && j === msg.lines.length - 1 ? <span className="hl-mark">{line}</span> : line}
                </p>
              ))}
              {msg.buttons ? (
                <div className="wa-btn mt-1 pt-0.5">
                  {msg.buttons.map((label) => (
                    <p key={label} className="py-0.5 text-center text-[0.72rem] font-medium">
                      {label}
                    </p>
                  ))}
                </div>
              ) : null}
              {i === 0 || i === messages.length - 1 ? (
                <p className={cn('mt-0.5 text-[0.58rem] text-[#3f4f57]', parent ? 'text-start' : 'text-end')}>{msg.time}</p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
