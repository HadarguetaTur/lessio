import { getTranslations } from 'next-intl/server'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { getPlatformOverview } from '@/lib/superadmin/dashboard'
import { PageHeader } from '@/components/ui/page-header'
import { ActivationFunnel } from '@/components/admin/ActivationFunnel'
import { AttentionQueue } from '@/components/admin/AttentionQueue'
import { PlatformActivityRow } from '@/components/admin/PlatformActivityRow'
import { PlatformNotificationsList } from '@/components/admin/PlatformNotificationsList'
import { RecentOrgsList } from '@/components/admin/RecentOrgsList'
import { SaasMetricRow } from '@/components/admin/SaasMetricRow'

/**
 * Platform overview — superadmin only.
 * Guard is in (admin)/admin/layout.tsx via requirePlatformSession().
 *
 * Per /docs/sprint-34-scope.md § /admin. `/admin` used to 404: the sidebar
 * always deep-linked to /admin/dashboard, which now redirects here.
 */
export default async function AdminOverviewPage() {
  const t = await getTranslations('admin.overview')
  const { profileId } = await requirePlatformSession()
  const { metrics, funnel, attention, activity, recentOrgs } = await getPlatformOverview()

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('title')} subtitle={t('description')} />
      <PlatformNotificationsList profileId={profileId} />

      <SaasMetricRow metrics={metrics} />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttentionQueue items={attention} />
        <ActivationFunnel stages={funnel} />
      </div>

      <PlatformActivityRow activity={activity} />

      <RecentOrgsList orgs={recentOrgs} />
    </div>
  )
}
