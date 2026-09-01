/**
 * The platform console's authorization choke point.
 *
 * Per /docs/sprint-34-scope.md § B. Every page and action under /admin resolves
 * its session through this file, which is what makes a capability model
 * possible at all: platform writes run on the service-role client and so are
 * never governed by RLS, leaving the TypeScript guard as the only gate.
 *
 * Before this, `profiles.role = 'superadmin'` was necessary *and sufficient* to
 * reply to a support ticket — and the same predicate also changed any org's
 * plan, cancelled subscriptions, exported tenant data and entered support mode.
 *
 * Server-only. Never import from client components.
 */

import { notFound, redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import {
  capabilitiesFor,
  isPlatformRole,
  type PlatformCapability,
  type PlatformRole,
} from './capabilities'

export interface PlatformSession {
  userId: string
  /** Same as userId — profiles.id references auth.users(id). */
  profileId: string
  fullName: string
  role: PlatformRole
  capabilities: PlatformCapability[]
}

async function readPlatformSession(): Promise<PlatformSession | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !isPlatformRole(profile.role)) return null
  // A deactivated colleague keeps their auth user — the profile row is what is
  // revoked. `is_active` was never checked anywhere before; with more than one
  // operator it is the difference between an offboarding and a lingering key.
  if (profile.is_active === false) return null

  return {
    userId: user.id,
    profileId: user.id,
    fullName: profile.full_name,
    role: profile.role,
    capabilities: capabilitiesFor(profile.role),
  }
}

/**
 * The guard for every /admin page and server action.
 *
 * No session → /login. A tenant user → /dashboard. A platform user missing the
 * capability → 404, deliberately not a redirect: sending them to a page they
 * also cannot open is how redirect loops are built, and "this does not exist
 * for you" is the honest answer.
 */
export async function requirePlatformSession(
  capability?: PlatformCapability
): Promise<PlatformSession> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const session = await readPlatformSession()
  if (!session) redirect('/dashboard')

  if (capability && !session.capabilities.includes(capability)) notFound()

  return session
}

/**
 * Non-redirecting variant for route handlers.
 *
 * A `fetch` follows `redirect()` to the login page and reports it as a 200 with
 * an HTML body — the same trap `assertFeature` exists to avoid under /api/v1.
 */
export async function getPlatformSessionOrNull(
  capability?: PlatformCapability
): Promise<PlatformSession | null> {
  const session = await readPlatformSession()
  if (!session) return null
  if (capability && !session.capabilities.includes(capability)) return null
  return session
}

/** Throwing check for code that already holds a session. */
export function assertPlatformCapability(
  session: PlatformSession,
  capability: PlatformCapability
): void {
  if (!session.capabilities.includes(capability)) notFound()
}

export function can(session: PlatformSession, capability: PlatformCapability): boolean {
  return session.capabilities.includes(capability)
}

/**
 * @deprecated Use {@link requirePlatformSession} with the capability the caller
 * actually needs. Kept so the tenant-side SupportModeBanner and the auth tests
 * keep compiling; it now means "any platform role", which is weaker than its
 * name suggests.
 */
export { requireSuperAdminSession } from '@/lib/auth/session'
export type { SuperAdminSession } from '@/lib/auth/session'
