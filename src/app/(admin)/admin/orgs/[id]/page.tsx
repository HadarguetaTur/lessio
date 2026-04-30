import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { OrganizationDetailCard } from '@/components/admin/OrganizationDetailCard'
import { OrganizationSettingsForm } from '@/components/admin/OrganizationSettingsForm'
import { DeletionRequestsSection } from '@/components/admin/DeletionRequestsSection'
import { OrgDataExportButton } from '@/components/admin/OrgDataExportButton'
import { StartSupportModeButton } from './StartSupportModeButton'
import { getOrganizationDetail } from '@/lib/superadmin/organizations'
import { listDeletionRequests } from '@/lib/superadmin/dataDeletion'
import { updateOrganizationAction } from '../actions'
import { processDeletionRequestAction, exportOrgDataAction } from './actions'

/**
 * Organization detail page — superadmin only.
 * Per /docs/sprint-18-scope.md § Story 5.
 */

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminOrgDetailPage({ params }: Props) {
  const t = await getTranslations('common')
  const { id } = await params
  const [org, deletionRequests] = await Promise.all([
    getOrganizationDetail(id),
    listDeletionRequests(id),
  ])
  if (!org) notFound()

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/admin/orgs"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowRight size={13} />
        {t('actions.back')}
      </Link>

      <div className="flex items-start justify-between mb-6">
        <AdminHeader title={org.name} description={`slug: ${org.slug}`} />
        <StartSupportModeButton orgId={org.id} orgName={org.name} />
      </div>

      <OrganizationDetailCard org={org} />
      <OrganizationSettingsForm org={org} action={updateOrganizationAction} />

      <DeletionRequestsSection
        requests={deletionRequests}
        orgId={org.id}
        processAction={processDeletionRequestAction}
      />

      <div className="mt-4 flex justify-end">
        <OrgDataExportButton orgId={org.id} exportAction={exportOrgDataAction} />
      </div>
    </div>
  )
}
