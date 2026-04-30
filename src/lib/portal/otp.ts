/**
 * OTP generation, storage, and verification for parent portal login.
 * OTPs are 6-digit, SHA-256 hashed before storage, expire after 10 minutes, single-use.
 *
 * Per /docs/sprint-13-scope.md § Story 3.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

export interface VerifyOtpParams {
  phone: string
  orgId: string
  otp: string
}

/**
 * Verifies OTP — returns true and marks as used if valid.
 * Returns false if wrong OTP, already used, or expired.
 */
export async function verifyOtp({ phone, orgId, otp }: VerifyOtpParams): Promise<boolean> {
  const db = createServiceRoleClient()
  const otp_hash = await hashOtp(otp)

  const { data } = await db
    .from('portal_otps')
    .select('id')
    .eq('phone', phone)
    .eq('organization_id', orgId)
    .eq('otp_hash', otp_hash)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!data) return false

  await db.from('portal_otps').update({ used: true }).eq('id', data.id)
  return true
}
