import React from 'react'
import Link from 'next/link'
import { CheckCircle2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AttentionCheckRow, type AttentionRowCheck } from './AttentionRowCheckbox'

export type AttentionTone = 'neutral' | 'amber' | 'rose' | 'blue' | 'violet'

const TONE_STYLES: Record<AttentionTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  violet: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
}

interface AttentionCardProps {
  icon: LucideIcon
  title: string
  /** True total, not the number of rows rendered — the pill next to the heading. */
  count: number
  href: string
  /** Rendered only when there are more items than the rows shown. */
  viewAllLabel: string
  hasMore?: boolean
  emptyLabel: string
  tone?: AttentionTone
  children?: React.ReactNode
}

/**
 * One "needs attention" bucket as a fixed-shell card: heading + count, a short
 * list of rows, and a view-all footer pinned to the bottom. `h-full` + a
 * `flex-1` body keeps every card in the row the same height without the list
 * growing without bound.
 */
export function AttentionCard({
  icon: Icon,
  title,
  count,
  href,
  viewAllLabel,
  hasMore = false,
  emptyLabel,
  tone = 'neutral',
  children,
}: AttentionCardProps) {
  const isEmpty = count === 0

  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm">
      <Link href={href} className="group/head flex items-center gap-2.5 px-4 pt-4 pb-2">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            isEmpty ? TONE_STYLES.neutral : TONE_STYLES[tone]
          )}
        >
          <Icon size={14} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground transition-colors group-hover/head:text-primary">
          {title}
        </h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
            isEmpty ? 'bg-muted text-muted-foreground' : TONE_STYLES[tone]
          )}
        >
          {count}
        </span>
      </Link>

      <div className="flex-1 px-2 pb-2">
        {isEmpty ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>

      {hasMore && (
        <Link
          href={href}
          className="mt-auto block border-t border-border/70 px-4 py-2 text-center text-xs font-medium text-primary transition-colors hover:bg-muted/40"
        >
          {viewAllLabel}
        </Link>
      )}
    </section>
  )
}

interface AttentionRowProps {
  href: string
  primary: React.ReactNode
  secondary?: React.ReactNode
  /** Small pill between the name and the trailing value (e.g. age in days). */
  badge?: React.ReactNode
  /** Right-most (logical end) value — an amount or a date. */
  trailing?: React.ReactNode
  trailingStrong?: boolean
  /**
   * When set, the row is wrapped in the client check-row shell: a "done"
   * tick at the logical start, sibling of the link rather than nested in it —
   * nesting an interactive element in an anchor breaks both semantics and
   * the click.
   */
  check?: AttentionRowCheck
}

/** Compact, divider-free row. Hover background does the separating. */
export function AttentionRow({
  href,
  primary,
  secondary,
  badge,
  trailing,
  trailingStrong,
  check,
}: AttentionRowProps) {
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{primary}</span>
        {secondary && (
          <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
        )}
      </span>
      {badge}
      {trailing && (
        <span
          className={cn(
            'shrink-0 text-xs text-muted-foreground',
            trailingStrong && 'text-sm font-semibold text-foreground'
          )}
        >
          {trailing}
        </span>
      )}
    </>
  )

  if (check) {
    return (
      <AttentionCheckRow {...check} href={href}>
        {content}
      </AttentionCheckRow>
    )
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
    >
      {content}
    </Link>
  )
}

/** Sub-heading inside a card that holds two buckets (billing: approval + debt). */
export function AttentionSubHeader({
  label,
  href,
  trailing,
}: {
  label: string
  href: string
  trailing?: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-2 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground transition-colors hover:text-primary"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing && <span className="shrink-0 tabular-nums">{trailing}</span>}
    </Link>
  )
}
