import { AdminHeader } from '@/components/admin/AdminHeader'
import { PlatformKpiGrid } from '@/components/admin/PlatformKpiGrid'
import { NeedsSetupList } from '@/components/admin/NeedsSetupList'
import { RecentOrgsList } from '@/components/admin/RecentOrgsList'
import { getPlatformDashboard } from '@/lib/superadmin/dashboard'

/**
 * Platform dashboard — superadmin only.
 * Guard is in (admin)/admin/layout.tsx via requireSuperAdminSession().
 *
 * Per /docs/sprint-18-scope.md § Story 2.
 */
export default async function AdminDashboardPage() {
  const { stats, needsSetup, recentOrgs } = await getPlatformDashboard()

  return (
    <div className="max-w-5xl mx-auto">
      <AdminHeader title="לוח בקרה" description="מצב הפלטפורמה בזמן אמת" />
      <PlatformKpiGrid stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeedsSetupList orgs={needsSetup} />
        <RecentOrgsList orgs={recentOrgs} />
      </div>
    </div>
  )
}
