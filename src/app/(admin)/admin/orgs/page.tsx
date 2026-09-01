import { requirePlatformSession } from '@/lib/superadmin/session'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
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
  await requirePlatformSession('orgs.read')

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
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('orgs.title')}
        subtitle={t('orgs.count', { count: orgs.length })}
        actions={
          <Button asChild>
            <Link href="/admin/orgs/new">
              <Plus size={15} />
              {t('orgs.newOrg')}
            </Link>
          </Button>
        }
      />

      <OrganizationFilters />
      <OrganizationsTable orgs={orgs} />
    </div>
  )
}
