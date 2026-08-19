/**
 * Connect the demo organization to Meta's WhatsApp Cloud API TEST NUMBER.
 *
 * Context: the Embedded Signup flow is the only production path that stores a
 * WhatsApp connection, but the Meta test number has no OAuth flow — its
 * temporary access token (~23h) is copied from App Dashboard → WhatsApp →
 * API Setup. This script writes that connection directly onto the demo org,
 * for the App Review screencast.
 *
 * Usage (from the repo root, re-run every time the test token is refreshed):
 *   npx tsx scripts/connect-demo-whatsapp.ts
 *
 * Required env (read from the environment, falling back to .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WHATSAPP_TOKEN_ENCRYPTION_KEY   ← MUST equal the key set in Vercel:
 *                                     encryption happens here, decryption in prod.
 *   WHATSAPP_DEMO_ACCESS_TOKEN      ← fresh test-number token from API Setup
 * Optional env:
 *   WHATSAPP_DEMO_PHONE_NUMBER_ID   (default: 1338080832713619)
 *   WHATSAPP_DEMO_WABA_ID           (default: 1066332709132512)
 *   DEMO_ORG_OWNER_EMAIL            (default: reviewer@getlessio.com)
 *
 * Safe to re-run: plain UPDATEs, idempotent.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { encryptToken } from '../src/lib/crypto'
import { subscribeAppToWABA, getSubscribedApps } from '../src/lib/whatsapp/subscribeApp'
import { META_API_VERSION } from '../src/lib/whatsapp/graphVersion'

const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`

const DEFAULT_PHONE_NUMBER_ID = '1338080832713619'
const DEFAULT_WABA_ID = '1066332709132512'
// The App Review demo tenant (scripts/seed-review-demo.ts). The earlier Hebrew
// demo org and its owner account were deleted on 2026-08-17.
const DEFAULT_OWNER_EMAIL = 'reviewer@getlessio.com'

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

// ── Graph helpers ─────────────────────────────────────────────────────────────

async function verifyGraphToken(
  token: string,
  phoneNumberId: string
): Promise<{ display_phone_number?: string; verified_name?: string }> {
  const res = await fetch(
    `${GRAPH_BASE}/${phoneNumberId}?fields=id,display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Graph token verification failed (${res.status}): ${body}\n` +
        '→ The ~23h test token has probably expired. Copy a fresh one from\n' +
        '  App Dashboard → WhatsApp → API Setup into WHATSAPP_DEMO_ACCESS_TOKEN and re-run.'
    )
  }
  return res.json() as Promise<{ display_phone_number?: string; verified_name?: string }>
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const encryptionKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY
  const accessToken = process.env.WHATSAPP_DEMO_ACCESS_TOKEN

  const phoneNumberId = process.env.WHATSAPP_DEMO_PHONE_NUMBER_ID ?? DEFAULT_PHONE_NUMBER_ID
  const wabaId = process.env.WHATSAPP_DEMO_WABA_ID ?? DEFAULT_WABA_ID
  const ownerEmail = process.env.DEMO_ORG_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL

  const missing = [
    !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
    !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    !encryptionKey && 'WHATSAPP_TOKEN_ENCRYPTION_KEY',
    !accessToken && 'WHATSAPP_DEMO_ACCESS_TOKEN',
  ].filter(Boolean)

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }

  console.log(
    '⚠  Reminder: WHATSAPP_TOKEN_ENCRYPTION_KEY here MUST be identical to the one in Vercel —\n' +
      '   the token is encrypted locally but decrypted by the production webhook.\n' +
      `   Local key fingerprint: ${encryptionKey!.slice(0, 4)}…${encryptionKey!.slice(-4)}\n`
  )

  // 1. Verify the token against Graph before touching the DB — fail fast on expiry.
  const info = await verifyGraphToken(accessToken!, phoneNumberId)
  console.log(
    `✓ Graph token valid — test number ${info.display_phone_number ?? phoneNumberId}` +
      (info.verified_name ? ` (${info.verified_name})` : '')
  )

  const db = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  })

  // 2. Resolve the demo org by its owner's email.
  const { data: usersPage, error: usersErr } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (usersErr) {
    console.error('Failed to list auth users:', usersErr.message)
    process.exit(1)
  }
  const user = usersPage.users.find(
    (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
  )
  if (!user) {
    console.error(`No auth user found with email ${ownerEmail}`)
    process.exit(1)
  }

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('organization_id, full_name')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr || !profile?.organization_id) {
    console.error(
      `Could not resolve organization for ${ownerEmail}: ${profileErr?.message ?? 'no profile/org'}`
    )
    process.exit(1)
  }
  const orgId = profile.organization_id as string

  const { data: org } = await db
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()
  console.log(`✓ Demo org resolved: "${org?.name ?? '(unnamed)'}" [${orgId}] (owner ${ownerEmail})`)

  // 3. whatsapp_phone_number_id is UNIQUE — release it if any *other* org holds it.
  //    Clear the whole connection, not just the id: a leftover waba_id + token
  //    leaves the previous org showing as connected in /settings/whatsapp and lets
  //    its send paths keep using a number it no longer owns.
  const { data: holders } = await db
    .from('organizations')
    .select('id, name')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .neq('id', orgId)
  for (const holder of holders ?? []) {
    console.warn(
      `⚠  Releasing phone_number_id ${phoneNumberId} from org "${holder.name}" [${holder.id}]`
    )
    const { error: releaseErr } = await db
      .from('organizations')
      .update({
        whatsapp_phone_number_id: null,
        whatsapp_waba_id: null,
        whatsapp_access_token: null,
      })
      .eq('id', holder.id)
    if (releaseErr) {
      console.error(`Failed to release the number from ${holder.id}: ${releaseErr.message}`)
      process.exit(1)
    }
  }

  // 4. Write the connection.
  const { error: updateErr } = await db
    .from('organizations')
    .update({
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_waba_id: wabaId,
      whatsapp_access_token: encryptToken(accessToken!),
    })
    .eq('id', orgId)
  if (updateErr) {
    console.error('Failed to update organization:', updateErr.message)
    process.exit(1)
  }
  console.log(`✓ Connection saved: phone_number_id=${phoneNumberId}, waba_id=${wabaId}, token encrypted`)

  // 5. Subscribe the app to the WABA. A missing subscription is the #1 cause of
  //    "webhook verified but no inbound messages", so the actual state is printed
  //    loudly either way (test WABAs sometimes reject the POST — not fatal).
  try {
    await subscribeAppToWABA(wabaId, accessToken!)
  } catch (err) {
    console.warn(
      `⚠  subscribeAppToWABA failed: ${err instanceof Error ? err.message : String(err)}\n` +
        '   (Common on Meta test WABAs — check the actual state below.)'
    )
  }
  try {
    const apps = await getSubscribedApps(wabaId, accessToken!)
    if (apps.length === 0) {
      console.warn(
        '⚠  subscribed_apps is EMPTY — the app is NOT registered on this WABA.\n' +
          '   If inbound messages do not arrive, fix this first (App Dashboard → WhatsApp → Configuration).'
      )
    } else {
      const names = apps
        .map((a) => a.whatsapp_business_api_data?.name ?? a.whatsapp_business_api_data?.id ?? '?')
        .join(', ')
      console.log(`✓ WABA subscribed_apps: ${names}`)
    }
  } catch (err) {
    console.warn(
      `⚠  Could not list subscribed_apps: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  console.log(
    '\nDone. Next steps:\n' +
      '  1. Meta webhook (once): callback https://www.getlessio.com/api/whatsapp/webhook,\n' +
      '     verify token = WHATSAPP_VERIFY_TOKEN (Vercel), subscribe to "messages".\n' +
      '  2. Open the 24h window: send "היי" from the verified number to the test number.\n' +
      '  3. Re-run this script whenever the test token is refreshed (~daily).'
  )
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
