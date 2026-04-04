import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { SupportModeBanner } from '@/components/dashboard/SupportModeBanner'
import { getSupportSession } from '@/lib/support-session'
import { PATHNAME_HEADER } from '@/proxy'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
      <div className="flex flex-col min-h-screen bg-gray-50" dir="rtl">
        <SupportModeBanner
          orgName={org?.name ?? supportSession.targetOrgId}
          expiresAt={supportSession.expiresAt}
        />
        <div className="flex flex-1">
          <Sidebar
            userName={`${adminProfile?.full_name ?? 'Admin'} (תמיכה)`}
            userRole="owner"
          />
          <main className="flex-1 overflow-auto p-6">{children}</main>
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
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  // Superadmins have no org — redirect them to the platform admin shell.
  if (profile?.role === 'superadmin') {
    redirect('/admin/dashboard')
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
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar
        userName={profile?.full_name ?? user.email ?? ''}
        userRole={profile?.role ?? ''}
      />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
