/**
 * Portal session management — httpOnly cookie with a 7-day JWT.
 * Signs/verifies portal sessions for parent access.
 * Server-only. Never import from client components.
 *
 * Per /docs/sprint-13-scope.md § Story 3.
 * Decision: parent portal auth via phone OTP → httpOnly cookie (jose JWT).
 *
 * The cookie is not the whole answer: it carries no session id, so it cannot be
 * revoked, and its `orgId` is a claim the holder presents rather than a fact.
 * `getPortalSession()` therefore re-checks the parent row on every request —
 * see the note there.
 */

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { cache } from 'react'

import { createServiceRoleClient } from '@/lib/supabase/service-role'

const COOKIE_NAME = 'portal_session'
const EXPIRY_SECONDS = 60 * 60 * 24 * 7 // 7 days

export interface PortalSession {
  parentId: string
  orgId: string
}

function getSecret(): Uint8Array {
  const secret = process.env.PORTAL_JWT_SECRET
  if (!secret) throw new Error('PORTAL_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signPortalSession(session: PortalSession): Promise<string> {
  return new SignJWT({ ...session, type: 'portal_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(getSecret())
}

export async function verifyPortalSession(token: string): Promise<PortalSession> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.type !== 'portal_session') throw new Error('Invalid token type')
  return {
    parentId: payload.parentId as string,
    orgId: payload.orgId as string,
  }
}

/**
 * Confirms the parent behind a cookie is still entitled to it.
 *
 * Memoised per request (the cookie is fixed within one), so the check costs a
 * single primary-key lookup per page render or action regardless of how many
 * times the session is asked for.
 */
const isSessionStillValid = cache(async (parentId: string, orgId: string): Promise<boolean> => {
  const db = createServiceRoleClient()
  const { data: parent } = await db
    .from('parents')
    .select('id, organization_id, is_active')
    .eq('id', parentId)
    .maybeSingle()

  if (!parent) return false
  // is_active is nullable (DEFAULT true), so only an explicit false revokes.
  if (parent.is_active === false) return false
  // The org in the cookie is a claim by its holder; this is the only place it
  // is checked against the parent's actual organization.
  return parent.organization_id === orgId
})

/**
 * The portal session, or null if the cookie no longer entitles its holder.
 *
 * The DB check lives here rather than in a separate `getActivePortalSession()`
 * on purpose. There are seventeen call sites and every one is an auth check; a
 * parallel "checked" variant would just invite the next call site to reach for
 * the unchecked one, which is the exact failure mode this fixes. Without it a
 * parent who is deactivated or moved keeps schedule, payments, messages and
 * self-cancellation — which writes charges — for up to seven days.
 *
 * A deactivated parent is folded into null rather than reported distinctly,
 * matching the login flow's refusal to reveal whether a phone is known.
 */
export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  let session: PortalSession
  try {
    session = await verifyPortalSession(token)
  } catch {
    return null
  }

  if (!session.parentId || !session.orgId) return null
  if (!(await isSessionStillValid(session.parentId, session.orgId))) return null

  return session
}

export async function setPortalSessionCookie(session: PortalSession): Promise<void> {
  const token = await signPortalSession(session)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: EXPIRY_SECONDS,
    path: '/',
  })
}

export async function clearPortalSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
