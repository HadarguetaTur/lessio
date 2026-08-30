/**
 * The three auth contexts. CLAUDE.md: "never mix them" — so three separate
 * cookie jars, minted three different ways.
 *
 * Login helper ported from .audit/lib.mjs (that directory is gitignored, so it
 * cannot be imported from committed code).
 */

import { SignJWT } from 'jose'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { BASE, TENANTS, LOCALES } from './config.mjs'

/** .env.local as a FALLBACK only — shell env always wins, as in the seed scripts. */
export function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

/** Dashboard / teacher shell — a real login, then reuse the storageState. */
export async function loginState(browser, { email, password, locale }) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: LOCALES[locale].accept,
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60000 })
  const state = await ctx.storageState()
  const landed = new URL(page.url()).pathname
  await ctx.close()
  return { state, landed }
}

export async function ownerState(browser, locale) {
  const t = TENANTS[locale]
  return loginState(browser, { email: t.ownerEmail, password: t.password, locale })
}

/**
 * Parent portal. type:'portal_session' is mandatory — verifyPortalSession
 * (src/lib/portal/session.ts:36) rejects anything else. Minting directly also
 * skips the WhatsApp OTP round-trip, which the demo org cannot do (no number).
 */
export async function portalCookie(locale = 'he') {
  const TENANT = TENANTS[locale]
  const secret = process.env.PORTAL_JWT_SECRET
  if (!secret) throw new Error('PORTAL_JWT_SECRET is not set')
  const token = await new SignJWT({
    parentId: TENANT.parentId,
    orgId: TENANT.orgId,
    type: 'portal_session',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret))

  return { name: 'portal_session', value: token, url: BASE, httpOnly: true, sameSite: 'Lax' }
}

/**
 * Booking WebView. Mirrors signBookingToken() in src/lib/jwt/index.ts, which
 * cannot be imported here (TS behind the @/ alias).
 *
 * 15-minute expiry: mint immediately before the shot, never at runner start.
 */
export async function bookingToken(locale = 'he') {
  const TENANT = TENANTS[locale]
  const secret = process.env.BOOKING_JWT_SECRET
  if (!secret) throw new Error('BOOKING_JWT_SECRET is not set')
  return new SignJWT({
    organizationId: TENANT.orgId,
    parentId: TENANT.parentId,
    studentId: TENANT.studentId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(secret))
}
