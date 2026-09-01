import { getLocale } from 'next-intl/server'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { getAdminNavCounts } from '@/lib/superadmin/navCounts'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs'
import { AdminTopBar } from '@/components/admin/AdminTopBar'
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette'

/**
 * Platform console shell — platform staff only.
 *
 * A tenant user is redirected to /dashboard. Capability checks live on the
 * individual pages and actions; this only establishes "is platform staff".
 *
 * Per /docs/sprint-34-scope.md § A the structure now matches the tenant shell
 * exactly — Sidebar | (TopBar → SectionTabs → centred scroll container) — so
 * the two consoles read as one product. Both bars are shrink-0, so the tab row
 * never scrolls away with the content.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requirePlatformSession()
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const counts = await getAdminNavCounts(session.capabilities)

  const sidebar = (mobile: boolean) => (
    <AdminSidebar
      userName={session.fullName}
      role={session.role}
      capabilities={session.capabilities}
      counts={counts}
      mobile={mobile}
    />
  )

  return (
    <div className="flex h-screen bg-background" dir={dir}>
      {sidebar(false)}
      <main className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          capabilities={session.capabilities}
          dir={dir}
          mobileNavigation={sidebar(true)}
        />
        <AdminSectionTabs capabilities={session.capabilities} />
        <div
          dir={dir}
          className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col overflow-y-auto px-4 py-4 duration-300 animate-in fade-in-0 slide-in-from-bottom-2 sm:px-6 sm:py-5 lg:px-8 lg:py-6"
        >
          {children}
        </div>
      </main>
      <AdminCommandPalette capabilities={session.capabilities} />
    </div>
  )
}
