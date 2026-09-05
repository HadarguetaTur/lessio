/**
 * One-off backfill: encrypt the plaintext Sumit card tokens already stored in
 * organization_subscriptions.sumit_payment_token.
 *
 * Why a script and not a migration: the column is encrypted with AES-256-GCM in
 * the app's own iv:ciphertext:authTag envelope, which plain SQL cannot produce
 * (pgcrypto has no GCM mode and a different envelope). No migration is needed
 * either way — every SQL reference to this column is an `IS NOT NULL` test, and
 * ciphertext is still non-null.
 *
 * Idempotent. Each row is probed by *attempting a decrypt*: if it succeeds the
 * row is already encrypted and is left alone. That is safer than sniffing for
 * the two colons, because a plaintext token may legitimately contain them.
 *
 * Ordering is forgiving, because nothing decrypts this column at request time.
 * The renewal engine charges by Sumit customer id and passes no token at all
 * (see the note in src/lib/saas/renewal.ts), so the stored value is only a
 * marker that the subscription has a card. A row that lands as plaintext
 * between the backfill and the next deploy is therefore a privacy regression to
 * mop up on a later run, not a failed charge. Re-run the script whenever.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/encrypt-saas-payment-tokens.ts --dry-run   # report only
 *   npx tsx scripts/encrypt-saas-payment-tokens.ts             # write
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL and
 * PAYMENT_CONFIG_ENCRYPTION_KEY in the environment or .env.local. Point it at
 * production only when that is what you mean: it prints the target host and
 * waits for confirmation unless --yes is given.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createInterface } from 'readline'
import { createClient } from '@supabase/supabase-js'
import { encryptSaasPaymentToken, decryptSaasPaymentToken } from '../src/lib/crypto'

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] ??= value
  }
}

/** True when the value round-trips through the app's decrypt — i.e. already done. */
function isAlreadyEncrypted(value: string): boolean {
  try {
    decryptSaasPaymentToken(value)
    return true
  } catch {
    return false
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((res) => rl.question(question, res))
  rl.close()
  return answer.trim().toLowerCase() === 'yes'
}

async function main(): Promise<void> {
  loadEnvLocal()

  const dryRun = process.argv.includes('--dry-run')
  const assumeYes = process.argv.includes('--yes')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  if (!process.env.PAYMENT_CONFIG_ENCRYPTION_KEY) {
    throw new Error('PAYMENT_CONFIG_ENCRYPTION_KEY must be set — and must be the key production uses')
  }

  console.log(`Target: ${new URL(url).host}`)
  console.log(dryRun ? 'Mode:   dry run (no writes)\n' : 'Mode:   WRITE\n')

  if (!dryRun && !assumeYes) {
    if (!(await confirm('Encrypt stored card tokens on this database? type "yes": '))) {
      console.log('Aborted.')
      return
    }
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: rows, error } = await db
    .from('organization_subscriptions')
    .select('id, organization_id, sumit_payment_token')
    .not('sumit_payment_token', 'is', null)

  if (error) throw new Error(`Could not read subscriptions: ${error.message}`)

  const subs = (rows ?? []) as {
    id: string
    organization_id: string
    sumit_payment_token: string
  }[]

  let encrypted = 0
  let skipped = 0
  let failed = 0

  for (const sub of subs) {
    if (isAlreadyEncrypted(sub.sumit_payment_token)) {
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`  would encrypt: subscription ${sub.id} (org ${sub.organization_id})`)
      encrypted++
      continue
    }

    const ciphertext = encryptSaasPaymentToken(sub.sumit_payment_token)

    // Verify before writing: a value that will not decrypt back is a token the
    // renewal charger can never use again, and the plaintext is gone once
    // overwritten.
    if (decryptSaasPaymentToken(ciphertext) !== sub.sumit_payment_token) {
      console.error(`  FAILED round-trip check: subscription ${sub.id} — left untouched`)
      failed++
      continue
    }

    const { error: upErr } = await db
      .from('organization_subscriptions')
      .update({ sumit_payment_token: ciphertext })
      .eq('id', sub.id)

    if (upErr) {
      console.error(`  FAILED to write: subscription ${sub.id} — ${upErr.message}`)
      failed++
      continue
    }

    console.log(`  encrypted: subscription ${sub.id} (org ${sub.organization_id})`)
    encrypted++
  }

  console.log(
    `\n${subs.length} row(s) with a token: ` +
      `${encrypted} ${dryRun ? 'to encrypt' : 'encrypted'}, ` +
      `${skipped} already encrypted, ${failed} failed.`
  )

  if (failed > 0) process.exitCode = 1
  else if (!dryRun && encrypted > 0) {
    console.log(
      '\nRenewals do not read this value — they charge by Sumit customer id — so\n' +
        'nothing here can break a charge. To confirm the cards themselves are\n' +
        'still good, run the renewal charger with authoriseOnly: it asks Sumit to\n' +
        'authorise each customer without moving money.'
    )
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
