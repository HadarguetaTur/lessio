import React from 'react'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  /** A pen doodle from `@/components/brand/PenMarks`; replaces the icon chip. */
  doodle?: React.ReactNode
  /** One handwritten line above the title (decision #48, diary moment 3). */
  note?: string
  title: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, doodle, note, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border py-16 flex flex-col items-center gap-3 text-center',
        className
      )}
    >
      {doodle ? (
        <div className="text-primary">{doodle}</div>
      ) : (
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <Icon size={22} className="text-muted-foreground/50" />
        </div>
      )}
      <div>
        {note && <p className="font-hand text-2xl leading-none font-bold text-primary mb-1.5">{note}</p>}
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
