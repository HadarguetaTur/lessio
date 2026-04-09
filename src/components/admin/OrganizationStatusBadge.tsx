'use client'

import { useTranslations } from 'next-intl'
import type { OrgStatus } from '@/lib/superadmin/organizations'

const STATUS_CLASS: Record<OrgStatus, string> = {
  needs_setup: 'bg-amber-50 text-amber-700',
  active:      'bg-green-50 text-green-700',
  inactive:    'bg-gray-100 text-gray-500',
}

export function OrganizationStatusBadge({ status }: { status: OrgStatus }) {
  const t = useTranslations('admin')
  const label = t(`orgs.status.${status}` as Parameters<typeof t>[0])
  const className = STATUS_CLASS[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
