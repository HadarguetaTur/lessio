import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminMobileNav } from '@/components/admin/AdminMobileNav'
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette'
import { getAdminNavCounts } from '@/lib/superadmin/navCounts'
import { getLocale } from 'next-intl/server'

/**
 * Platform admin layout — superadmin only.
 * Non-superadmin users are redirected to /dashboard by requireSuperAdminSession().
 *
 * Per /docs/sprint-18-scope.md § Story 1; nav grouped and badged in Sprint 34
 * (/docs/sprint-34-scope.md § מבנה המידע החדש).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSuperAdminSession()
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const counts = await getAdminNavCounts()

  return (
      <div className="flex h-screen bg-muted/40" dir={dir}>
      <AdminSidebar userName={session.fullName} counts={counts} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <AdminMobileNav userName={session.fullName} dir={dir} counts={counts} />
          <div className="text-sm font-medium text-foreground">LESSIO Admin</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">{children}</div>
      </main>
      <AdminCommandPalette />
    </div>
  )
}
