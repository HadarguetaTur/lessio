import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
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
  const t = await getTranslations('admin')
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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden">
      <div className="flex items-start justify-between mb-6">
        <AdminHeader
          title={t('orgs.title')}
          description={`${orgs.length} ${t('orgs.title')}`}
        />
        <Link
          href="/admin/orgs/new"
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={15} />
          {t('orgs.newOrg')}
        </Link>
      </div>

      <OrganizationFilters />
      <OrganizationsTable orgs={orgs} />
    </div>
  )
}
