import { cn } from '@/lib/utils'

/**
 * How far down the landing page visits got, one bar per section.
 *
 * Each bar is a share of all visits, not of the previous bar: sections are
 * recorded independently (an anchor jump to pricing skips the ones above), so
 * "of those who saw X" would be a claim the data does not make. The drop next
 * to a bar is the simple difference from the section before it — the place to
 * look for where the page loses people.
 */
export function SectionFunnel({
  steps,
  total,
  emptyLabel,
}: {
  steps: { id: string; label: string; count: number }[]
  total: number
  emptyLabel: string
}) {
  if (total === 0) {
    return <p className="rounded-xl border border-border bg-background p-5 text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ol className="space-y-2 rounded-xl border border-border bg-background p-5">
      {steps.map((step, i) => {
        const share = step.count / total
        const prev = i === 0 ? null : steps[i - 1].count / total
        const drop = prev == null ? null : Math.round((prev - share) * 100)

        return (
          <li key={step.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
            <span className="truncate font-medium">{step.label}</span>
            <span className="h-5 overflow-hidden rounded bg-muted" aria-hidden>
              <span className="block h-full rounded bg-primary/70" style={{ width: `${Math.max(share * 100, share > 0 ? 1 : 0)}%` }} />
            </span>
            <span className="min-w-[6.5rem] whitespace-nowrap text-end tabular-nums">
              {Math.round(share * 100)}%
              <span className="ms-1 text-xs text-muted-foreground">({step.count})</span>
              {drop != null && drop > 0 && (
                <span dir="ltr" className={cn('ms-1 inline-block text-xs', drop >= 20 ? 'text-destructive' : 'text-muted-foreground')}>
                  −{drop}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
