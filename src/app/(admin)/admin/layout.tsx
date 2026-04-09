import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { getLocale } from 'next-intl/server'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

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
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  return (
      <div className="flex h-screen bg-gray-50" dir={dir}>
      <AdminSidebar userName={session.fullName} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open navigation"
              >
                <Menu size={16} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={dir === 'rtl' ? 'right' : 'left'}
              className="w-[280px] p-0 sm:max-w-[280px]"
              showCloseButton={false}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Admin navigation</SheetTitle>
              </SheetHeader>
              <AdminSidebar userName={session.fullName} mobile />
            </SheetContent>
          </Sheet>
          <div className="text-sm font-medium text-foreground">LESSIO Admin</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">{children}</div>
      </main>
    </div>
  )
}
