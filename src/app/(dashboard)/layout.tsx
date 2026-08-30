import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { MobileAdminQuickSheet } from '@/components/dashboard/MobileAdminQuickSheet'
import { SupportPanelProvider } from '@/components/dashboard/support/SupportPanelProvider'
import { SupportLauncher } from '@/components/dashboard/support/SupportLauncher'
import {
  createTicketAction,
  replyToTicketAction,
  fetchMyConversationsAction,
  fetchConversationAction,
} from './support/actions'
import { SupportModeBanner } from '@/components/dashboard/SupportModeBanner'
import { getSupportSession } from '@/lib/support-session'
import { PATHNAME_HEADER } from '@/proxy'
import { getLocale, getTranslations } from 'next-intl/server'
import { SaasOwnerBanners } from '@/components/dashboard/SaasOwnerBanners'
import { NotificationBell } from '@/components/dashboard/NotificationBell'
import { getUnreadCount } from '@/lib/notifications'
import {
  fetchNotificationsAction,
  fetchUnreadCountAction,
  markAsReadAction,
  markAllReadAction,
} from './notifications/actions'
import { getNavigationSaasFeatures } from '@/lib/saas/subscriptions'
import { getActiveTeacherCount } from '@/lib/teachers'
import { LiveRefreshProvider } from '@/lib/realtime/LiveRefreshProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = await getTranslations()
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  // ── Support mode (superadmin inspecting an org) ──────────────────────────
  // Check BEFORE the normal session flow, because the superadmin's own profile
  // would otherwise be redirected back to /admin/dashboard.
  const supportSession = await getSupportSession()

  if (supportSession) {
    const saasFeaturesSupport = await getNavigationSaasFeatures(supportSession.targetOrgId)
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
      <div className="flex h-screen flex-col bg-background" dir={dir}>
        <SupportModeBanner
          orgName={org?.name ?? supportSession.targetOrgId}
          expiresAt={supportSession.expiresAt}
        />
        {/*
          min-h-0 + overflow-hidden matter here: the banner eats part of the
          h-screen column, so without them the sidebar/main row keeps its
          content height, pushes the scroll container below the fold, and the
          page becomes unscrollable.
        */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar
            userName={t('admin.supportSuffix', { name: adminProfile?.full_name ?? 'Admin' })}
            userRole="owner"
            saasFeatures={saasFeaturesSupport}
          />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar
              currentLocale={locale}
              userRole="owner"
              saasFeatures={saasFeaturesSupport}
              mobileNavigation={
                <Sidebar
                  userName={t('admin.supportSuffix', { name: adminProfile?.full_name ?? 'Admin' })}
                  userRole="owner"
                  mobile
                  saasFeatures={saasFeaturesSupport}
                />
              }
            />
            <div
              dir={dir}
              className="mx-auto flex w-full max-w-[1440px] flex-1 min-h-0 flex-col overflow-y-auto px-4 py-4 max-lg:scroll-pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] max-lg:pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] animate-in fade-in-0 slide-in-from-bottom-2 duration-300 sm:px-6 sm:py-5 lg:px-8 lg:py-6"
            >
              <SaasOwnerBanners orgId={supportSession.targetOrgId} />
              {children}
            </div>
            <MobileAdminQuickSheet />
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

    // NOTE: do not bounce `pending_payment` orgs to /onboarding here. A fresh
    // signup can never be both onboarding_completed AND pending_payment (see
    // completeOnboarding), so this only fires for an existing org mid-upgrade —
    // and /onboarding sends completed orgs straight back to /dashboard, which
    // produced an infinite redirect loop. The billing page renders the pending
    // state, and the mock-payment / payment-callback pages handle completion.
  }

  // Teachers may only access /teacher/* and /homework/* (sidebar links שיעורי בית).
  // src/proxy.ts forwards the current pathname on every request.
  if (profile?.role === 'teacher') {
    const headersList = await headers()
    const pathname = headersList.get(PATHNAME_HEADER) ?? '/'
    const allowed =
      pathname.startsWith('/teacher') ||
      pathname.startsWith('/homework') ||
      pathname.startsWith('/students') ||
      pathname.startsWith('/parents')
    if (!allowed) {
      redirect('/teacher/dashboard')
    }
  }

  // Owner/admin surfaces: the mobile quick menu and the support widget.
  // Teachers get neither — a teacher's support route is their own org's owner.
  const isOrgStaff = profile?.role === 'owner' || profile?.role === 'admin'

  // Navigation, not entitlement: a read-only org keeps every menu entry so its
  // owner can still reach and export their data. Writes and feature gates are
  // enforced elsewhere against the real plan.
  let saasFeatures: Awaited<ReturnType<typeof getNavigationSaasFeatures>>
  let teacherCount: number | undefined
  if (
    profile?.organization_id &&
    (profile.role === 'owner' || profile.role === 'admin')
  ) {
    ;[saasFeatures, teacherCount] = await Promise.all([
      getNavigationSaasFeatures(profile.organization_id),
      getActiveTeacherCount(profile.organization_id),
    ])
  }

  const showSaasBanners =
    (profile?.role === 'owner' || profile?.role === 'admin') && profile?.organization_id

  // Notification bell — fetch initial unread count server-side
  const initialUnreadCount = profile?.organization_id
    ? await getUnreadCount(user.id, profile.organization_id)
    : 0

  const bellElement = profile?.organization_id ? (
    <NotificationBell
      initialUnreadCount={initialUnreadCount}
      locale={locale}
      fetchNotifications={fetchNotificationsAction}
      fetchUnreadCount={fetchUnreadCountAction}
      markAsRead={markAsReadAction}
      markAllRead={markAllReadAction}
    />
  ) : null

  return (
    <LiveRefreshProvider orgId={profile?.organization_id ?? null}>
      <div className="flex h-screen bg-background" dir={dir}>
      <Sidebar
        userName={profile?.full_name ?? user.email ?? ''}
        userRole={profile?.role ?? ''}
        saasFeatures={saasFeatures}
        teacherCount={teacherCount}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          currentLocale={locale}
          userRole={profile?.role ?? 'owner'}
          saasFeatures={saasFeatures}
          notificationBell={bellElement}
          mobileNavigation={
            <Sidebar
              userName={profile?.full_name ?? user.email ?? ''}
              userRole={profile?.role ?? ''}
              mobile
              saasFeatures={saasFeatures}
              teacherCount={teacherCount}
            />
          }
        />
        <div
          dir={dir}
          className="mx-auto flex w-full max-w-[1440px] flex-1 min-h-0 flex-col overflow-y-auto px-4 py-4 max-lg:scroll-pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] max-lg:pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] animate-in fade-in-0 slide-in-from-bottom-2 duration-300 sm:px-6 sm:py-5 lg:px-8 lg:py-6"
        >
          {showSaasBanners ? <SaasOwnerBanners orgId={profile!.organization_id as string} /> : null}
          {children}
        </div>
        {/*
          The provider wraps both launchers because they share one panel: a
          floating pill on desktop, a row inside the quick-actions sheet on
          mobile. Deliberately absent from the support-mode branch above —
          there the "customer" is a superadmin impersonating the org, and a
          ticket filed from that seat is noise in their own queue.
        */}
        {isOrgStaff ? (
          <SupportPanelProvider
            locale={locale}
            firstName={(profile?.full_name ?? '').trim().split(/\s+/)[0] ?? ''}
            actions={{
              createTicket: createTicketAction,
              reply: replyToTicketAction,
              fetchConversations: fetchMyConversationsAction,
              fetchConversation: fetchConversationAction,
            }}
          >
            <MobileAdminQuickSheet />
            <SupportLauncher />
          </SupportPanelProvider>
        ) : null}
      </main>
    </div>
    </LiveRefreshProvider>
  )
}
