import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSupportSession } from '@/lib/support-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface UserSession {
  userId: string
  profileId: string  // same as userId — profiles.id references auth.users(id)
  orgId: string
  role: string
  fullName: string
  /** True when a superadmin is viewing this org via support-mode cookie. */
  isSupportMode?: boolean
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
  const support = await getSupportSession()
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
      fullName: `${adminProfile?.full_name ?? 'Admin'} (תמיכה)`,
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
  if (profile.role === 'superadmin') redirect('/admin/dashboard')

  return {
    userId: user.id,
    profileId: user.id,
    orgId: profile.organization_id as string,
    role: profile.role,
    fullName: profile.full_name,
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
export function requireMutation(session: UserSession): void {
  if (session.isSupportMode) {
    // A stable code, not display copy: this is synchronous, so it cannot await a
    // translator. Callers surface it with `commonError('supportModeReadOnly')`.
    throw new Error(SUPPORT_MODE_READ_ONLY)
  }
}

/** Thrown by {@link requireMutation}. Never shown to a user as-is. */
export const SUPPORT_MODE_READ_ONLY = 'SUPPORT_MODE_READ_ONLY'

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
