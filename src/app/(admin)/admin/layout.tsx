import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

/**
 * Platform admin layout — superadmin only.
 * Non-superadmin users are redirected to /dashboard by requireSuperAdminSession().
 *
 * Per /docs/sprint-18-scope.md § Story 1.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSuperAdminSession()

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <AdminSidebar userName={session.fullName} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
