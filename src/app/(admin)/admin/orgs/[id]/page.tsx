import { requirePlatformSession } from '@/lib/superadmin/session'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'

import { getOrganizationDetail } from '@/lib/superadmin/organizations'
import { listDeletionRequests } from '@/lib/superadmin/dataDeletion'
import { listSubscriptions } from '@/lib/superadmin/metrics'
import { listSaasInvoicesForPlatform } from '@/lib/superadmin/revenue'
import { listAdminAuditLog } from '@/lib/superadmin/audit'
import { listActiveSaasPlans } from '@/lib/saas/plans'
import { getOrgQuotaUsage } from '@/lib/saas/quota'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTabs } from '@/components/admin/AdminTabs'
import { OrganizationDetailCard } from '@/components/admin/OrganizationDetailCard'
import { OrganizationSettingsForm } from '@/components/admin/OrganizationSettingsForm'
import { OrgSubscriptionPanel } from '@/components/admin/OrgSubscriptionPanel'
import { OrgUsagePanel } from '@/components/admin/OrgUsagePanel'
import { OrgAuditPanel } from '@/components/admin/OrgAuditPanel'
import { DeletionRequestsSection } from '@/components/admin/DeletionRequestsSection'
import { OrgDataExportButton } from '@/components/admin/OrgDataExportButton'
import { StartSupportModeButton } from './StartSupportModeButton'
import { updateOrganizationAction } from '../actions'
import { processDeletionRequestAction, exportOrgDataAction } from './actions'
import {
  cancelSubscriptionAction,
  changePlanAction,
  extendTrialAction,
  setSubscriptionStatusAction,
} from '../../subscriptions/actions'

/**
 * Organization detail — superadmin only.
 *
 * Sprint 18 § Story 5; rebuilt as tabs in Sprint 34
 * (/docs/sprint-34-scope.md § /admin/orgs/[id]). Each tab is its own URL and
 * loads only its own data, so opening a tenant no longer means fetching its
 * subscription, invoices, quota and audit history whether or not they are read.
 */

const TABS = ['overview', 'subscription', 'usage', 'settings', 'danger'] as const
type Tab = (typeof TABS)[number]

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function AdminOrgDetailPage({ params, searchParams }: Props) {
  await requirePlatformSession('orgs.read')

  const t = await getTranslations('common')
  const tOrgs = await getTranslations('admin.orgs')
  const locale = await getLocale()

  const { id } = await params
  const { tab: tabParam } = await searchParams
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'overview'

  const org = await getOrganizationDetail(id)
  if (!org) notFound()

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/orgs"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowRight size={13} className="ltr:rotate-180" />
        {t('actions.back')}
      </Link>

      <PageHeader
        title={org.name}
        subtitle={org.slug}
        actions={<StartSupportModeButton orgId={org.id} orgName={org.name} />}
      />

      <AdminTabs
        basePath={`/admin/orgs/${org.id}`}
        current={tab}
        tabs={TABS.map((key) => ({ key, label: tOrgs(`tabs.${key}`) }))}
      />

      {tab === 'overview' && <OrganizationDetailCard org={org} />}

      {tab === 'subscription' && (
        <SubscriptionTab orgId={org.id} locale={locale} />
      )}

      {tab === 'usage' && <UsageTab orgId={org.id} attribution={org.attribution} />}

      {tab === 'settings' && (
        <OrganizationSettingsForm org={org} action={updateOrganizationAction} />
      )}

      {tab === 'danger' && (
        <DangerTab orgId={org.id} />
      )}
    </div>
  )
}

async function SubscriptionTab({ orgId, locale }: { orgId: string; locale: string }) {
  const [subs, invoices, plans] = await Promise.all([
    listSubscriptions(),
    listSaasInvoicesForPlatform(),
    listActiveSaasPlans(),
  ])

  return (
    <OrgSubscriptionPanel
      orgId={orgId}
      subscription={subs.find((s) => s.organizationId === orgId) ?? null}
      invoices={invoices.filter((i) => i.organizationId === orgId)}
      plans={plans.map((p) => ({
        id: p.id,
        label: locale === 'he' ? p.display_name_he : p.display_name_en,
        priceMonthly: p.price_monthly,
      }))}
      changePlanAction={changePlanAction}
      extendTrialAction={extendTrialAction}
      setStatusAction={setSubscriptionStatusAction}
      cancelAction={cancelSubscriptionAction}
    />
  )
}

async function UsageTab({
  orgId,
  attribution,
}: {
  orgId: string
  attribution: Record<string, unknown> | null
}) {
  const quota = await getOrgQuotaUsage(orgId)
  return <OrgUsagePanel quota={quota} attribution={attribution} />
}

async function DangerTab({ orgId }: { orgId: string }) {
  const [deletionRequests, auditEntries] = await Promise.all([
    listDeletionRequests(orgId),
    listAdminAuditLog({ organizationId: orgId, limit: 50 }),
  ])

  return (
    <div className="space-y-4">
      <DeletionRequestsSection
        requests={deletionRequests}
        orgId={orgId}
        processAction={processDeletionRequestAction}
      />

      <div className="flex justify-end">
        <OrgDataExportButton orgId={orgId} exportAction={exportOrgDataAction} />
      </div>

      <OrgAuditPanel entries={auditEntries} />
    </div>
  )
}
