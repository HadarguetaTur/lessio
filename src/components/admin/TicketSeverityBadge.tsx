'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { TicketSeverity } from '@/lib/support/tickets'

/**
 * Severity pill. Only ever rendered once AI triage (M2) has classified a
 * ticket — an unclassified ticket shows no severity rather than a fake 'low'.
 */
const SEVERITY_CLASS: Record<TicketSeverity, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
}

export function TicketSeverityBadge({
  severity,
  className,
}: {
  severity: TicketSeverity
  className?: string
}) {
  const t = useTranslations('admin.support.severity')

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        SEVERITY_CLASS[severity] ?? 'bg-gray-100 text-gray-600 border-gray-200',
        className
      )}
    >
      {t(severity)}
    </span>
  )
}
