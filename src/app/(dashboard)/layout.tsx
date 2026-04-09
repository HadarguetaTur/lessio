import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { SupportModeBanner } from '@/components/dashboard/SupportModeBanner'
import { getSupportSession } from '@/lib/support-session'
import { PATHNAME_HEADER } from '@/proxy'
import { getLocale } from 'next-intl/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  // ── Support mode (superadmin inspecting an org) ──────────────────────────
  // Check BEFORE the normal session flow, because the superadmin's own profile
  // would otherwise be redirected back to /admin/dashboard.
  const supportSession = await getSupportSession()

  if (supportSession) {
    const db = createServiceRoleClient()
    const { data: org } = await db
      .from('organizations')
      .select('name')
      .eq('id', supportSession.targetOrgId)
      .single()

    const { data: adminProfile } = await db
      .from('profiles')
      .select('full_name')
      .eq('id', supportSession.superAdminId)
      .single()

    return (
      <div className="flex flex-col h-screen bg-background" dir={dir}>
        <SupportModeBanner
          orgName={org?.name ?? supportSession.targetOrgId}
          expiresAt={supportSession.expiresAt}
        />
        <div className="flex flex-1">
          <Sidebar
            userName={`${adminProfile?.full_name ?? 'Admin'} (תמיכה)`}
            userRole="owner"
          />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          currentLocale={locale}
          userRole="owner"
          mobileNavigation={
            <Sidebar
              userName={`${adminProfile?.full_name ?? 'Admin'} (תמיכה)`}
              userRole="owner"
              mobile
            />
          }
        />
        <div dir={dir} className="flex flex-1 min-h-0 flex-col overflow-y-auto max-w-screen-xl mx-auto w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              {children}
            </div>
          </main>
        </div>
      </div>
    )
  }

  // ── Normal org-user session ───────────────────────────────────────────────
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belt-and-suspenders — middleware handles this, but protect at layout level too.
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, organization_id')
    .eq('id', user.id)
    .single()

  // Superadmins have no org — redirect them to the platform admin shell.
  if (profile?.role === 'superadmin') {
    redirect('/admin/dashboard')
  }

  // Onboarding check: owners of orgs that haven't completed onboarding
  if (profile?.role === 'owner' && profile.organization_id) {
    const db = createServiceRoleClient()
    const { data: org } = await db
      .from('organizations')
      .select('onboarding_completed')
      .eq('id', profile.organization_id)
      .single()

    if (org && !org.onboarding_completed) {
      redirect('/onboarding')
    }
  }

  // Teachers may only access /teacher/* and /homework/* (sidebar links שיעורי בית).
  // src/proxy.ts forwards the current pathname on every request.
  if (profile?.role === 'teacher') {
    const headersList = await headers()
    const pathname = headersList.get(PATHNAME_HEADER) ?? '/'
    const allowed =
      pathname.startsWith('/teacher') || pathname.startsWith('/homework')
    if (!allowed) {
      redirect('/teacher/schedule')
    }
  }

  return (
      <div className="flex h-screen bg-background" dir={dir}>
      <Sidebar
        userName={profile?.full_name ?? user.email ?? ''}
        userRole={profile?.role ?? ''}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          currentLocale={locale}
          userRole={profile?.role ?? 'owner'}
          mobileNavigation={
            <Sidebar
              userName={profile?.full_name ?? user.email ?? ''}
              userRole={profile?.role ?? ''}
              mobile
            />
          }
        />
        <div dir={dir} className="flex flex-1 min-h-0 flex-col overflow-y-auto max-w-screen-xl mx-auto w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          {children}
        </div>
      </main>
    </div>
  )
}
