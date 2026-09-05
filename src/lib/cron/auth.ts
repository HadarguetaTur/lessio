/**
 * Bearer authentication for internal cron routes.
 *
 * Some scheduled jobs run in Next.js rather than as Deno Edge Functions,
 * because this runtime owns the billing and payment-provider adapters. They are
 * triggered by pg_cron (scripts/setup-crons.sql) with a bearer token whose
 * plaintext lives only in Supabase Vault; the app knows the SHA-256 of it, so
 * the secret is not coupled to whichever Supabase key Vercel currently holds.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

export function hasValidCronAuthorization(
  request: NextRequest,
  opts: {
    /** Env var holding the hex SHA-256 of the expected bearer token. */
    envHashVar: string
  }
): boolean {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!supplied) return false

  // No in-source fallback: a digest committed to the repo pins the credential to
  // git history for good, so rotating it would mean shipping code. Every hash
  // lives in the environment, and env.ts fails the production build if one is
  // missing — a loud stop rather than a cron that quietly 401s.
  const expectedHash = process.env[opts.envHashVar]
  if (!expectedHash) return false

  const suppliedHash = createHash('sha256').update(supplied).digest()
  let expected: Buffer
  try {
    expected = Buffer.from(expectedHash, 'hex')
  } catch {
    return false
  }
  if (expected.length !== suppliedHash.length) return false
  return timingSafeEqual(suppliedHash, expected)
}
