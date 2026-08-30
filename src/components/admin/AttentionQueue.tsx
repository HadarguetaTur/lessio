import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { AlertCircle, AlertTriangle, ChevronLeft, Info } from 'lucide-react'

import type { AttentionItem, AttentionSeverity } from '@/lib/superadmin/attention'
import { cn } from '@/lib/utils'

/**
 * Everything that costs money if it is ignored today, in one ordered list.
 *
 * Per /docs/sprint-34-scope.md § /admin block 3. Replaces NeedsSetupList,
 * which asked one question — is WhatsApp or payment missing — and so stayed
 * silent about failed renewals, lapsing trials and tenants hitting a quota.
 */

const SEVERITY_STYLE: Record<
  AttentionSeverity,
  { icon: typeof AlertCircle; dot: string; text: string }
> = {
  critical: { icon: AlertCircle, dot: 'bg-destructive', text: 'text-destructive' },
  warning: { icon: AlertTriangle, dot: 'bg-amber-500', text: 'text-amber-600' },
  info: { icon: Info, dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
}

const MAX_VISIBLE = 12

export async function AttentionQueue({ items }: { items: AttentionItem[] }) {
  const t = await getTranslations('admin.overview.attention')
  const visible = items.slice(0, MAX_VISIBLE)
  const criticalCount = items.filter((i) => i.severity === 'critical').length

  return (
    <section className="rounded-xl border border-border bg-background">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        {criticalCount > 0 && (
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold tabular-nums text-destructive">
            {criticalCount}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('clear')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((item) => {
            const style = SEVERITY_STYLE[item.severity]
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn('size-1.5 shrink-0 rounded-full', style.dot)}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.organizationName}</p>
                    <p className={cn('truncate text-xs', style.text)}>
                      {t(item.kind, item.values)}
                    </p>
                  </div>
                  <ChevronLeft
                    size={14}
                    className="shrink-0 text-muted-foreground rtl:rotate-0 ltr:rotate-180"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {items.length > MAX_VISIBLE && (
        <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
          {t('more', { count: items.length - MAX_VISIBLE })}
        </p>
      )}
    </section>
  )
}
