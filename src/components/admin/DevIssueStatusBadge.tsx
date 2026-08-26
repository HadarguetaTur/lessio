'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { DevIssueStatus } from '@/lib/superadmin/devIssues'

const STATUS_CLASS: Record<DevIssueStatus, string> = {
  open: 'bg-red-50 text-red-700 border-red-200',
  investigating: 'bg-amber-50 text-amber-700 border-amber-200',
  fixed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wont_fix: 'bg-gray-100 text-gray-600 border-gray-200',
}

export function DevIssueStatusBadge({
  status,
  className,
}: {
  status: DevIssueStatus
  className?: string
}) {
  const t = useTranslations('admin.devIssues.status')

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        STATUS_CLASS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
        className
      )}
    >
      {t(status)}
    </span>
  )
}
