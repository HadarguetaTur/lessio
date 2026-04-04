import type { OrgStatus } from '@/lib/superadmin/organizations'

const CONFIG: Record<OrgStatus, { label: string; className: string }> = {
  needs_setup: { label: 'דורש הגדרה', className: 'bg-amber-50 text-amber-700' },
  active:      { label: 'פעיל',        className: 'bg-green-50 text-green-700' },
  inactive:    { label: 'לא פעיל',     className: 'bg-gray-100 text-gray-500'  },
}

export function OrganizationStatusBadge({ status }: { status: OrgStatus }) {
  const { label, className } = CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
