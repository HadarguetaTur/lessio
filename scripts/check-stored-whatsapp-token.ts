/**
 * Interrogate the token PRODUCTION actually sends with — the encrypted
 * `organizations.whatsapp_access_token` — not the one sitting in .env.local.
 *
 * Why this exists: `diagnose-demo-whatsapp.ts` tests the .env.local token with a
 * READ. That can say "valid ✓" while the stored token is a different, already-
 * expired one, so the bot receives messages and silently fails to reply
 * (error 190 / subcode 463, only visible in Vercel runtime logs).
 *
 * Read-only: decrypts, reads, and calls debug_token. Sends nothing, writes nothing.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/check-stored-whatsapp-token.ts
 *   npx tsx scripts/check-stored-whatsapp-token.ts owner@example.com
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '../src/lib/crypto'
import { META_API_VERSION } from '../src/lib/whatsapp/graphVersion'

const DEFAULT_OWNER_EMAIL = 'reviewer@getlessio.com'

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

function formatUnix(value: unknown): string {
  if (typeof value !== 'number') return String(value)
  if (value === 0) return 'never (0) ← permanent token'
  const when = new Date(value * 1000)
  const hours = (when.getTime() - Date.now()) / 3_600_000
  const rel = hours >= 0 ? `in ${hours.toFixed(1)}h` : `${Math.abs(hours).toFixed(1)}h AGO`
  return `${when.toISOString()} (${rel})`
}

async function main(): Promise<void> {
  loadEnvLocal()

  const ownerEmail = (process.argv[2] ?? process.env.DEMO_ORG_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).toLowerCase()

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: usersPage } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const user = usersPage?.users.find((u) => u.email?.toLowerCase() === ownerEmail)
  if (!user) {
    console.error(`✗ No auth user ${ownerEmail}`)
    process.exit(1)
  }
  const { data: profile } = await db
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()
  const { data: org } = await db
    .from('organizations')
    .select('name, whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', profile!.organization_id as string)
    .single()

  console.log(`Org: "${org?.name}" — phone_number_id ${org?.whatsapp_phone_number_id ?? 'NULL'}`)

  if (!org?.whatsapp_access_token) {
    console.log('✗ No token stored — run scripts/connect-demo-whatsapp.ts')
    process.exit(1)
  }

  let stored: string
  try {
    stored = decryptToken(org.whatsapp_access_token as string)
  } catch (err) {
    console.log(
      `✗ DECRYPT FAILED: ${err instanceof Error ? err.message : String(err)}\n` +
        '  → local WHATSAPP_TOKEN_ENCRYPTION_KEY does not match the key the token was encrypted with.'
    )
    process.exit(1)
  }

  console.log(`  stored token: ${stored.slice(0, 12)}…${stored.slice(-6)} (${stored.length} chars)`)
  console.log(
    `  identical to .env.local WHATSAPP_DEMO_ACCESS_TOKEN? ` +
      `${stored === process.env.WHATSAPP_DEMO_ACCESS_TOKEN ? 'yes' : 'NO — they have drifted'}`
  )

  // 1. Can the stored token still read the phone number?
  const read = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${org.whatsapp_phone_number_id}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${stored}` } }
  )
  const readBody = await read.text()
  console.log(`\n1. GET /${org.whatsapp_phone_number_id} → HTTP ${read.status} ${read.ok ? '✓' : '✗'}`)
  console.log(`   ${readBody.slice(0, 400)}`)

  // 2. What kind of token is it, and when does (did) it expire?
  const appId = process.env.META_APP_ID ?? process.env.WHATSAPP_APP_ID
  const appSecret = process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET
  if (!appId || !appSecret) {
    console.log('\n2. debug_token skipped — META_APP_ID / META_APP_SECRET missing from .env.local')
    return
  }

  const dbg = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/debug_token?input_token=${encodeURIComponent(stored)}` +
      `&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
  )
  const payload = (await dbg.json()) as { data?: Record<string, unknown>; error?: unknown }
  console.log(`\n2. debug_token → HTTP ${dbg.status}`)
  if (!payload.data) {
    console.log(`   ${JSON.stringify(payload).slice(0, 500)}`)
    return
  }
  const d = payload.data
  console.log(`   type:        ${d.type}`)
  console.log(`   is_valid:    ${d.is_valid}`)
  console.log(`   expires_at:  ${formatUnix(d.expires_at)}`)
  console.log(`   data_access: ${formatUnix(d.data_access_expires_at)}`)
  console.log(`   scopes:      ${Array.isArray(d.scopes) ? d.scopes.join(', ') : String(d.scopes)}`)
  if (d.error) console.log(`   error:       ${JSON.stringify(d.error)}`)
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
