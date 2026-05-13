/**
 * Portal session management — httpOnly cookie with 30-day JWT.
 * Signs/verifies portal sessions for parent access.
 * Server-only. Never import from client components.
 *
 * Per /docs/sprint-13-scope.md § Story 3.
 * Decision: parent portal auth via phone OTP → httpOnly cookie (jose JWT).
 */

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

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

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    return await verifyPortalSession(token)
  } catch {
    return null
  }
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
