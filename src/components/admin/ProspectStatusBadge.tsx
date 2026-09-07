import { cn } from '@/lib/utils'

/**
 * Status pill for prospects and platform leads. Server-renderable: the label
 * is translated by the caller so this stays a pure colour map.
 */

const TONES: Record<string, string> = {
  // prospects
  queued: 'bg-muted text-muted-foreground',
  claimed: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  sent: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  failed: 'bg-destructive/10 text-destructive',
  replied: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  interested: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  not_interested: 'bg-muted text-muted-foreground',
  unsubscribed: 'bg-destructive/10 text-destructive',
  bounced: 'bg-destructive/10 text-destructive',
  suppressed: 'bg-muted text-muted-foreground line-through',
  converted: 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300',
  // leads
  new: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  contacted: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  qualified: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  trial: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  won: 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300',
  lost: 'bg-muted text-muted-foreground',
  // reply classifications
  unsubscribe: 'bg-destructive/10 text-destructive',
  auto_reply: 'bg-muted text-muted-foreground',
  bounce: 'bg-destructive/10 text-destructive',
  unknown: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  unmatched: 'bg-muted text-muted-foreground',
}

export function ProspectStatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[status] ?? 'bg-muted text-muted-foreground'
      )}
    >
      {label}
    </span>
  )
}
