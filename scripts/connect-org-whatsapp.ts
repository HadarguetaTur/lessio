/**
 * Connect ANY organization to a WhatsApp Cloud API business number.
 *
 * Pilot-phase path: customer numbers are registered on WABAs owned by Hadar's
 * own business portfolio (Standard Access — no App Review needed), so there is
 * no Embedded Signup token. Instead the shared System User token (expiration
 * "Never", with the target WABA assigned as an asset) is stored on the org.
 * Generalized from connect-demo-whatsapp.ts, which is test-number-specific.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/connect-org-whatsapp.ts \
 *     --org-id <uuid> \
 *     --phone-number-id <id> \
 *     --waba-id <id>
 *
 * --org-id may be replaced with --owner-email <email> to resolve the org by
 * its owner's auth email.
 *
 * Required env (read from the environment, falling back to .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WHATSAPP_TOKEN_ENCRYPTION_KEY   ← MUST equal the key set in Vercel:
 *                                     encryption happens here, decryption in prod.
 *   WHATSAPP_CONNECT_ACCESS_TOKEN   ← System User token with the WABA as an
 *                                     asset (falls back to WHATSAPP_DEMO_ACCESS_TOKEN,
 *                                     which is the same System User in practice)
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

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(): {
  orgId?: string
  ownerEmail?: string
  phoneNumberId: string
  wabaId: string
} {
  const args = process.argv.slice(2)
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }

  const orgId = get('--org-id')
  const ownerEmail = get('--owner-email')
  const phoneNumberId = get('--phone-number-id')
  const wabaId = get('--waba-id')

  if ((!orgId && !ownerEmail) || !phoneNumberId || !wabaId) {
    console.error(
      'Usage: npx tsx scripts/connect-org-whatsapp.ts \\\n' +
        '  (--org-id <uuid> | --owner-email <email>) \\\n' +
        '  --phone-number-id <id> --waba-id <id>'
    )
    process.exit(1)
  }
  return { orgId, ownerEmail, phoneNumberId: phoneNumberId!, wabaId: wabaId! }
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
        '→ Check the token is the System User token and that the WABA holding\n' +
        '  this number is assigned to that System User as an asset.'
    )
  }
  return res.json() as Promise<{ display_phone_number?: string; verified_name?: string }>
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal()
  const { orgId: orgIdArg, ownerEmail, phoneNumberId, wabaId } = parseArgs()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const encryptionKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY
  const accessToken =
    process.env.WHATSAPP_CONNECT_ACCESS_TOKEN ?? process.env.WHATSAPP_DEMO_ACCESS_TOKEN

  const missing = [
    !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
    !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    !encryptionKey && 'WHATSAPP_TOKEN_ENCRYPTION_KEY',
    !accessToken && 'WHATSAPP_CONNECT_ACCESS_TOKEN (or WHATSAPP_DEMO_ACCESS_TOKEN)',
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

  // 1. Verify the token can read this phone number before touching the DB.
  const info = await verifyGraphToken(accessToken!, phoneNumberId)
  console.log(
    `✓ Graph token valid — number ${info.display_phone_number ?? phoneNumberId}` +
      (info.verified_name ? ` (display name: ${info.verified_name})` : '')
  )

  const db = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  })

  // 2. Resolve the org — directly by id, or via the owner's auth email.
  let orgId = orgIdArg
  if (!orgId) {
    const { data: usersPage, error: usersErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (usersErr) {
      console.error('Failed to list auth users:', usersErr.message)
      process.exit(1)
    }
    const user = usersPage.users.find(
      (u) => u.email?.toLowerCase() === ownerEmail!.toLowerCase()
    )
    if (!user) {
      console.error(`No auth user found with email ${ownerEmail}`)
      process.exit(1)
    }
    const { data: profile, error: profileErr } = await db
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
    if (profileErr || !profile?.organization_id) {
      console.error(
        `Could not resolve organization for ${ownerEmail}: ${profileErr?.message ?? 'no profile/org'}`
      )
      process.exit(1)
    }
    orgId = profile.organization_id as string
  }

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id, name, whatsapp_phone_number_id')
    .eq('id', orgId)
    .single()
  if (orgErr || !org) {
    console.error(`Organization ${orgId} not found: ${orgErr?.message ?? 'no row'}`)
    process.exit(1)
  }
  console.log(`✓ Org resolved: "${org.name ?? '(unnamed)'}" [${orgId}]`)
  if (org.whatsapp_phone_number_id && org.whatsapp_phone_number_id !== phoneNumberId) {
    console.warn(
      `⚠  Org currently holds a DIFFERENT number (${org.whatsapp_phone_number_id}) — it will be replaced.`
    )
  }

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
  //    loudly either way.
  try {
    await subscribeAppToWABA(wabaId, accessToken!)
  } catch (err) {
    console.warn(
      `⚠  subscribeAppToWABA failed: ${err instanceof Error ? err.message : String(err)}`
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
      '  1. If the number was never registered on Cloud API: POST /{phone_number_id}/register\n' +
      '     with the WHATSAPP_REGISTER_PIN (the settings connect flow does this too).\n' +
      '  2. Submit the org\'s Meta message templates on this WABA (needed for any\n' +
      '     business-initiated message outside the 24h window — monthly billing!).\n' +
      '  3. E2E: send a message from a test parent phone to the number → bot replies.'
  )
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
