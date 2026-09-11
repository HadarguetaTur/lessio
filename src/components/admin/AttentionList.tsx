import Link from 'next/link'
import { AlertCircle, AlertTriangle, ChevronLeft, Info } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A plain "what is waiting for you" list: pre-translated lines, each a link.
 *
 * The sibling `AttentionQueue` is bound to the platform overview (it knows
 * organizations and its own i18n namespace). This one knows nothing; the
 * page hands it finished strings, which is what lets the outbound cockpit
 * reuse the same visual language without inheriting the wrong data model.
 */

export type AttentionListItem = {
  key: string
  severity: 'critical' | 'warning' | 'info'
  href: string
  title: string
  detail?: string
}

const STYLE = {
  critical: { icon: AlertCircle, dot: 'bg-destructive', text: 'text-destructive' },
  warning: { icon: AlertTriangle, dot: 'bg-amber-500', text: 'text-amber-600' },
  info: { icon: Info, dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
} as const

export function AttentionList({
  title,
  items,
  emptyLabel,
}: {
  title: string
  items: AttentionListItem[]
  emptyLabel: string
}) {
  return (
    <section className="rounded-xl border border-border bg-background">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const style = STYLE[item.severity]
            return (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
                  <span className={cn('size-1.5 shrink-0 rounded-full', style.dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.detail && <p className={cn('truncate text-xs', style.text)}>{item.detail}</p>}
                  </div>
                  <ChevronLeft size={14} className="shrink-0 text-muted-foreground rtl:rotate-0 ltr:rotate-180" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
