import { isPlatformRole } from '@/lib/superadmin/capabilities'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveSupportSession } from '@/lib/support-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgSubscriptionState, isOrgSaasReadOnly } from '@/lib/saas/subscriptions'

export interface UserSession {
  userId: string
  profileId: string  // same as userId — profiles.id references auth.users(id)
  orgId: string
  role: string
  fullName: string
  /** True when a superadmin is viewing this org via support-mode cookie. */
  isSupportMode?: boolean
  /**
   * True when the org's Lessio subscription has lapsed (trial over, card
   * declined past its grace window, or cancelled). Resolved once per request
   * here so that {@link requireMutation} — which every mutating action
   * already calls — can refuse writes without 126 call sites having to
   * remember a second guard.
   */
  isSaasReadOnly?: boolean
}

export interface SuperAdminSession {
  userId: string
  profileId: string
  fullName: string
}

/**
 * Returns the current authenticated org-user session.
 * Redirects to /login if not authenticated.
 * Redirects to /admin/dashboard if the user is a superadmin.
 *
 * Safe to call from any dashboard Server Component or Server Action.
 * Never returns a superadmin session — callers can always assume orgId is a non-null string.
 */
export async function getSession(): Promise<UserSession> {
  // Support mode: superadmin viewing an org's dashboard read-only.
  // Check the support cookie before the normal Supabase session.
  const support = await getActiveSupportSession()
  if (support) {
    // Resolve the superadmin's name from their profile.
    const db = createServiceRoleClient()
    const { data: adminProfile } = await db
      .from('profiles')
      .select('full_name')
      .eq('id', support.superAdminId)
      .single()

    return {
      userId: support.superAdminId,
      profileId: support.superAdminId,
      orgId: support.targetOrgId,
      role: 'owner',  // read-only view as owner role so all UI loads
      // Shown in the support-mode banner. getSession() cannot await a
      // translator here, and this suffix is only ever seen by a superadmin.
      fullName: `${adminProfile?.full_name ?? 'Admin'} (support)`,
      isSupportMode: true,
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Superadmins have no org — redirect them to their own shell.
  // Any platform role, not just superadmin: they all have organization_id
  // NULL, and the UserSession contract promises orgId is a non-null string.
  if (isPlatformRole(profile.role)) redirect('/admin')

  const orgId = profile.organization_id as string

  // One query per request: getOrgSubscriptionState is React-cached, and the
  // dashboard layout asks for the same row.
  //
  // Never fatal. This runs on every authenticated request, so a transient
  // failure here would take the whole app down rather than one screen; and
  // it fails open on purpose — locking paying customers out of their own
  // data because a query blipped is the worse outcome of the two.
  let saasReadOnly = false
  try {
    saasReadOnly = isOrgSaasReadOnly(await getOrgSubscriptionState(orgId))
  } catch (e) {
    console.error('[auth/session] subscription lookup failed — treating org as writable', {
      orgId,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  return {
    userId: user.id,
    profileId: user.id,
    orgId,
    role: profile.role,
    fullName: profile.full_name,
    isSaasReadOnly: saasReadOnly,
  }
}

/**
 * Alias for getSession() — use this when you want to be explicit that
 * the caller requires an org-bound session (owner / admin / teacher).
 */
export const requireDashboardSession = getSession

/**
 * Throws an error if the current session is in support (read-only) mode.
 * Call this at the top of any server action that mutates data.
 *
 * Usage:
 *   const session = await getSession()
 *   requireMutation(session)
 */
export interface RequireMutationOptions {
  /**
   * Allow the write even when the subscription has lapsed. Only for the
   * actions a locked-out owner must still be able to perform: paying,
   * cancelling, opening a support ticket, reading notifications, changing
   * language. Everything else stays blocked — that is the point of the lock.
   */
  allowWhenLapsed?: boolean
}

export function requireMutation(
  session: UserSession,
  options?: RequireMutationOptions
): void {
  if (session.isSupportMode) {
    // A stable code, not display copy: this is synchronous, so it cannot await a
    // translator. Callers surface it with `commonError('supportModeReadOnly')`.
    throw new Error(SUPPORT_MODE_READ_ONLY)
  }

  // A lapsed subscription is read-only. Enforcing it here rather than at each
  // action means a newly written action is covered by default: the failure
  // mode of forgetting a guard is now "blocked" rather than "free product".
  if (session.isSaasReadOnly && !options?.allowWhenLapsed) {
    throw new Error(SAAS_READ_ONLY)
  }
}

/** Thrown by {@link requireMutation}. Never shown to a user as-is. */
export const SUPPORT_MODE_READ_ONLY = 'SUPPORT_MODE_READ_ONLY'

/**
 * Thrown by {@link requireMutation} when the org subscription has lapsed.
 * Caught by the dashboard error boundary, which shows an upgrade card.
 * Matches the string {@link assertOrgNotSaasReadOnly} already throws.
 */
export const SAAS_READ_ONLY = 'SAAS_READ_ONLY'

/**
 * Returns the current superadmin session.
 * Redirects to /login if not authenticated.
 * Redirects to /dashboard if the user is not a superadmin.
 *
 * Use in all /admin/* Server Components and Server Actions.
 */
export async function requireSuperAdminSession(): Promise<SuperAdminSession> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role !== 'superadmin') redirect('/dashboard')

  return {
    userId: user.id,
    profileId: user.id,
    fullName: profile.full_name,
  }
}

/**
 * Resolves the superadmin session without redirecting, or null.
 *
 * Route handlers must not call {@link requireSuperAdminSession}: it answers
 * failure with `redirect()`, which a `fetch` follows to the login page and then
 * reports as a 200 with an HTML body. Same trap that `assertFeature` exists to
 * avoid under /api/v1 — see /docs/sprint-33-scope.md.
 */
export async function getSuperAdminSessionOrNull(): Promise<SuperAdminSession | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') return null

  return { userId: user.id, profileId: user.id, fullName: profile.full_name }
}
