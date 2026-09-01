/**
 * Superadmin read-only support mode session.
 * A signed httpOnly cookie lets a superadmin inspect an org's dashboard
 * context for support/debugging with a fixed 30-minute TTL.
 *
 * Cookie payload:
 *   - superAdminId: uid of the platform operator
 *   - targetOrgId:  org being inspected
 *   - expiresAt:    ISO timestamp
 *
 * The dashboard layout + server actions check this cookie to:
 *   1. Show a support-mode banner with org name + remaining time
 *   2. Block all mutating server actions
 *
 * Server-only. Never import from client components.
 * Per /docs/sprint-18-scope.md § Story 6.
 */

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { capabilitiesFor } from '@/lib/superadmin/capabilities'

const COOKIE_NAME = 'support_session'
const TTL_SECONDS = 60 * 30 // 30 minutes

export interface SupportSession {
  superAdminId: string
  targetOrgId: string
  expiresAt: string
  /**
   * The operator's platform role at the moment the cookie was minted.
   * Recorded so a revoked grant is visible in the audit trail even after the
   * profile has changed; the live check is {@link getActiveSupportSession}.
   */
  grantedRole?: string
}

function getSecret(): Uint8Array {
  const secret = process.env.SUPPORT_SESSION_SECRET
  if (!secret) throw new Error('SUPPORT_SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signSupportSession(session: SupportSession): Promise<string> {
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()
  return new SignJWT({ ...session, expiresAt, type: 'support_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret())
}

export async function verifySupportSession(token: string): Promise<SupportSession> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.type !== 'support_session') throw new Error('Invalid token type')
  return {
    superAdminId: payload.superAdminId as string,
    targetOrgId: payload.targetOrgId as string,
    expiresAt: payload.expiresAt as string,
    grantedRole: typeof payload.grantedRole === 'string' ? payload.grantedRole : undefined,
  }
}

export async function getSupportSession(): Promise<SupportSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    return await verifySupportSession(token)
  } catch {
    return null
  }
}

export async function setSupportSessionCookie(session: SupportSession): Promise<void> {
  const token = await signSupportSession(session)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL_SECONDS,
    path: '/',
  })
}

export async function clearSupportSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

/**
 * The support session, but only if the operator may still impersonate.
 *
 * The cookie has a fixed 30-minute TTL and no revocation list, so a colleague
 * whose role is downgraded — or who is deactivated — would otherwise keep
 * browsing a tenant's dashboard until it expired. Costs one primary-key lookup,
 * and only on the rare request that actually carries the cookie.
 */
export async function getActiveSupportSession(): Promise<SupportSession | null> {
  const session = await getSupportSession()
  if (!session) return null

  const db = createServiceRoleClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role, is_active')
    .eq('id', session.superAdminId)
    .maybeSingle()

  if (!profile || profile.is_active === false) return null
  if (!capabilitiesFor(profile.role).includes('support_mode.enter')) return null

  return session
}
