import Link from 'next/link'
import { Plus } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { OrganizationsTable } from '@/components/admin/OrganizationsTable'
import { OrganizationFilters } from '@/components/admin/OrganizationFilters'
import { getOrganizationsList } from '@/lib/superadmin/organizations'
import type { OrgStatus } from '@/lib/superadmin/organizations'

/**
 * Organizations list — superadmin only.
 * Per /docs/sprint-18-scope.md § Story 3.
 */

interface Props {
  searchParams: Promise<{ search?: string; status?: string; missingSetup?: string }>
}

export default async function AdminOrgsPage({ searchParams }: Props) {
  const { search, status, missingSetup } = await searchParams

  const validStatuses: OrgStatus[] = ['needs_setup', 'active', 'inactive']
  const statusFilter = validStatuses.includes(status as OrgStatus)
    ? (status as OrgStatus)
    : ('' as const)

  const orgs = await getOrganizationsList({
    search,
    status: statusFilter,
    missingSetup: missingSetup === '1',
  })

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <AdminHeader
          title="ארגונים"
          description={`${orgs.length} ארגונים`}
        />
        <Link
          href="/admin/orgs/new"
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={15} />
          ארגון חדש
        </Link>
      </div>

      <OrganizationFilters />
      <OrganizationsTable orgs={orgs} />
    </div>
  )
}
