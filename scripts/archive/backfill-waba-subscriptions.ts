/**
 * One-time backfill: subscribe our Meta app to every already-connected WABA.
 *
 * Context: until Sprint 30, the Embedded Signup flow stored the customer's
 * token + waba_id but never called POST /{WABA_ID}/subscribed_apps, so Meta
 * never delivered message webhooks for those WABAs. This script registers the
 * subscription for all existing connected organizations and verifies each one.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/backfill-waba-subscriptions.ts
 *
 * Required env (read from the environment, falling back to .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WHATSAPP_TOKEN_ENCRYPTION_KEY
 *
 * Safe to re-run: the subscribed_apps POST is idempotent on Meta's side.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '../src/lib/crypto'
import { subscribeAppToWABA, getSubscribedApps } from '../src/lib/whatsapp/subscribeApp'

// ── Minimal .env.local loader (no dotenv dependency) ──────────────────────────

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
    if (!process.env[key]) process.env[key] = value
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

type OrgRow = {
  id: string
  name: string | null
  whatsapp_waba_id: string
  whatsapp_access_token: string
}

async function main(): Promise<void> {
  loadEnvLocal()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const encryptionKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY

  const missing = [
    !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
    !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    !encryptionKey && 'WHATSAPP_TOKEN_ENCRYPTION_KEY',
  ].filter(Boolean)

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }

  const db = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  })

  const { data, error } = await db
    .from('organizations')
    .select('id, name, whatsapp_waba_id, whatsapp_access_token')
    .not('whatsapp_waba_id', 'is', null)
    .not('whatsapp_access_token', 'is', null)

  if (error) {
    console.error('Failed to load organizations:', error.message)
    process.exit(1)
  }

  const orgs = (data ?? []) as OrgRow[]
  console.log(`Found ${orgs.length} organization(s) with a connected WABA\n`)

  let ok = 0
  let failed = 0

  for (const org of orgs) {
    const label = `${org.name ?? '(unnamed)'} [org ${org.id}, WABA ${org.whatsapp_waba_id}]`

    try {
      const accessToken = decryptToken(org.whatsapp_access_token)
      await subscribeAppToWABA(org.whatsapp_waba_id, accessToken)

      const apps = await getSubscribedApps(org.whatsapp_waba_id, accessToken)
      if (apps.length === 0) {
        throw new Error('subscribed_apps returned an empty list after POST')
      }

      const appNames = apps
        .map((a) => a.whatsapp_business_api_data?.name ?? a.whatsapp_business_api_data?.id ?? '?')
        .join(', ')
      console.log(`✓ ${label} — subscribed (${appNames})`)
      ok++
    } catch (err) {
      console.error(`✗ ${label} — ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }
  }

  console.log(`\nDone: ${ok} subscribed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
