/**
 * OTP generation, storage, and verification for parent portal login.
 * OTPs are 6-digit, SHA-256 hashed before storage, expire after 10 minutes, single-use.
 *
 * Per /docs/sprint-13-scope.md § Story 3.
 */

import { timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Wrong guesses a single code tolerates before it is burned. Shared by the
 * verifier and the rate-limit counter: a code burned this way must keep counting
 * against the send limit, or the limit resets on demand.
 */
export const MAX_FAILED_ATTEMPTS = 5

/** Generates a cryptographically random 6-digit OTP string. */
export function generateOtp(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(array[0] % 1_000_000).padStart(6, '0')
}

/** SHA-256 hash of the OTP (Web Crypto — available in Node 18+). */
export async function hashOtp(otp: string): Promise<string> {
  const data = new TextEncoder().encode(otp)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Buffer.from(hashBuffer).toString('hex')
}

export interface StoreOtpParams {
  phone: string
  orgId: string
  otp: string
}

/** Stores hashed OTP in portal_otps (expires in 10 min). */
export async function storeOtp({ phone, orgId, otp }: StoreOtpParams): Promise<void> {
  const db = createServiceRoleClient()
  const otp_hash = await hashOtp(otp)
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error } = await db.from('portal_otps').insert({
    organization_id: orgId,
    phone,
    otp_hash,
    expires_at,
  })
  if (error) throw new Error(`Failed to store OTP: ${error.message}`)
}

/**
 * Returns the number of OTP requests for this phone+org in the last
 * `windowMinutes` minutes that count against the rate limit. Used by
 * requestOtpAction to enforce max 3 per 15 min.
 *
 * Codes redeemed by a successful login are excluded on purpose: the limit exists to
 * blunt SMS/WhatsApp flooding, and a parent who actually logged in has proven they
 * hold the phone. Counting successes locked legitimate parents out after three logins
 * in a quarter hour — which on a shared family phone is an ordinary afternoon.
 *
 * A code burned by MAX_FAILED_ATTEMPTS wrong guesses is *not* a success, so it stays
 * counted. Excluding every `used` row let an attacker reset this counter at will:
 * request a code, spend five wrong guesses to flip it to used, and the window read
 * empty again — an unbounded loop of WhatsApp sends to any parent's phone and an
 * unbounded supply of codes to brute-force.
 */
export async function countRecentOtpRequests(
  phone: string,
  orgId: string,
  windowMinutes = 15
): Promise<number> {
  const db = createServiceRoleClient()
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const { count, error } = await db
    .from('portal_otps')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .eq('organization_id', orgId)
    .or(`used.eq.false,failed_attempts.gte.${MAX_FAILED_ATTEMPTS}`)
    .gte('created_at', since)
  if (error) throw new Error(`Rate limit check failed: ${error.message}`)
  return count ?? 0
}

export interface VerifyOtpParams {
  phone: string
  orgId: string
  otp: string
}

/**
 * Verifies OTP — returns true and marks as used if valid.
 * Returns false if wrong OTP, already used, expired, or attempt limit reached.
 *
 * Security properties:
 * - Single-use: row is marked used=true on success.
 * - Expiry-checked: expired rows are ignored.
 * - Attempt-limited: after MAX_FAILED_ATTEMPTS failed guesses the row is invalidated
 *   (used=true) while still counting against the send rate limit.
 * - Constant-time hash comparison via timingSafeEqual.
 */
export async function verifyOtp({ phone, orgId, otp }: VerifyOtpParams): Promise<boolean> {
  const db = createServiceRoleClient()
  const otp_hash = await hashOtp(otp)

  // Fetch the most recent active, unexpired OTP for this phone+org.
  // We do NOT filter by hash here so we can track failed attempts on the right row.
  const { data: record } = await db
    .from('portal_otps')
    .select('id, otp_hash, failed_attempts')
    .eq('phone', phone)
    .eq('organization_id', orgId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!record) return false

  // Already hit attempt limit — invalidate and reject.
  if ((record.failed_attempts as number) >= MAX_FAILED_ATTEMPTS) {
    await db.from('portal_otps').update({ used: true }).eq('id', record.id)
    return false
  }

  // Constant-time hash comparison to prevent timing-based OTP enumeration.
  const expectedBuf = Buffer.from(record.otp_hash as string, 'hex')
  const actualBuf = Buffer.from(otp_hash, 'hex')
  const hashMatch =
    expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)

  if (!hashMatch) {
    const newAttempts = (record.failed_attempts as number) + 1
    await db
      .from('portal_otps')
      .update({
        failed_attempts: newAttempts,
        // Lock the OTP after MAX_FAILED_ATTEMPTS failures so it cannot be used even if
        // later guessed correctly.
        ...(newAttempts >= MAX_FAILED_ATTEMPTS ? { used: true } : {}),
      })
      .eq('id', record.id)
    return false
  }

  // Valid OTP — mark single-use.
  await db.from('portal_otps').update({ used: true }).eq('id', record.id)
  return true
}
