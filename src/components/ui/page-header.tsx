import React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  /** Center title and actions on small screens (stacked layout). */
  mobileCentered?: boolean
  /** Escape hatch for per-page spacing (the dashboard tightens the bottom gap). */
  className?: string
}

export function PageHeader({ title, subtitle, actions, mobileCentered, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between',
        mobileCentered && 'items-center text-center sm:items-start sm:text-start',
        className,
      )}
    >
      <div
        className={cn(
          mobileCentered && 'flex w-full flex-col items-center sm:block sm:w-auto sm:items-start',
        )}
      >
        <h1 className="text-2xl font-bold text-foreground leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5 break-words">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div
          className={cn(
            'flex w-full min-w-0 max-w-full items-center gap-2 sm:w-auto sm:shrink-0',
            mobileCentered && 'justify-center sm:justify-start',
          )}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
