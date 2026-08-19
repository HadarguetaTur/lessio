/**
 * Diagnose the Meta test-number demo wiring end to end (read-only).
 * Usage: npx tsx scripts/diagnose-demo-whatsapp.ts
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { getSubscribedApps } from '../src/lib/whatsapp/subscribeApp'
import { META_API_VERSION } from '../src/lib/whatsapp/graphVersion'

const OWNER_EMAIL = process.env.DEMO_ORG_OWNER_EMAIL ?? 'reviewer@getlessio.com'
const EXPECTED_PNID = '1338080832713619'
const EXPECTED_WABA = '1066332709132512'
const PROD_WEBHOOK = 'https://www.getlessio.com/api/whatsapp/webhook'

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function main(): Promise<void> {
  loadEnvLocal()
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // 1. Org connection state
  const { data: usersPage } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const user = usersPage!.users.find((u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase())
  if (!user) { console.error(`✗ No auth user ${OWNER_EMAIL}`); process.exit(1) }
  const { data: profile } = await db.from('profiles').select('organization_id').eq('id', user.id).maybeSingle()
  const orgId = profile?.organization_id as string
  const { data: org } = await db
    .from('organizations')
    .select('name, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, automation_new_leads_enabled')
    .eq('id', orgId)
    .single()

  console.log(`Org: "${org?.name}" [${orgId}]`)
  const pnid = org?.whatsapp_phone_number_id as string | null
  console.log(`  1. phone_number_id: ${pnid ?? 'NULL ✗ — connect script has NOT run successfully'}`)
  if (pnid && pnid !== EXPECTED_PNID) console.log(`     ⚠ differs from test number ${EXPECTED_PNID}!`)
  console.log(`  2. waba_id:         ${org?.whatsapp_waba_id ?? 'NULL ✗'} (expected ${EXPECTED_WABA})`)
  console.log(`  3. token stored:    ${org?.whatsapp_access_token ? 'yes ✓' : 'NULL ✗'}`)

  // 2. Any inbound messages claimed recently? (proves Meta → webhook → org routing works)
  const { data: recent } = await db
    .from('whatsapp_processed_messages')
    .select('message_id, phone, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(3)
  console.log(`  4. recent inbound rows: ${recent?.length ? '' : 'NONE ✗ — no message ever reached the webhook for this org'}`)
  for (const r of recent ?? []) console.log(`     ${r.created_at}  ${r.phone}`)

  // 3. Parent row for the sender phone
  const { data: parent } = await db
    .from('parents')
    .select('full_name, phone, is_active')
    .eq('organization_id', orgId)
    .eq('phone', '+972504343547')
    .maybeSingle()
  console.log(`  5. parent +972504343547: ${parent ? `${parent.full_name}, active=${parent.is_active} ✓` : 'MISSING ✗'}`)

  // 4. Token validity + subscribed_apps (needs WHATSAPP_DEMO_ACCESS_TOKEN in .env.local)
  const token = process.env.WHATSAPP_DEMO_ACCESS_TOKEN
  if (!token) {
    console.log('  6. WHATSAPP_DEMO_ACCESS_TOKEN not in .env.local — skipping Graph checks')
  } else {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${EXPECTED_PNID}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    console.log(`  6. Graph token: ${res.ok ? 'valid ✓' : `INVALID ✗ (${res.status}) — refresh it in API Setup`}`)
    if (res.ok) {
      try {
        const apps = await getSubscribedApps(EXPECTED_WABA, token)
        console.log(
          `  7. WABA subscribed_apps: ${apps.length === 0 ? 'EMPTY ✗ — app not registered on WABA' : apps.map((a) => a.whatsapp_business_api_data?.name ?? a.whatsapp_business_api_data?.id).join(', ') + ' ✓'}`
        )
      } catch (e) {
        console.log(`  7. subscribed_apps check failed: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  // 5. Is the webhook route deployed and answering? (bad token → 403 is GOOD: route alive)
  try {
    const res = await fetch(`${PROD_WEBHOOK}?hub.mode=subscribe&hub.verify_token=__diagnostic__&hub.challenge=x`, { redirect: 'manual' })
    console.log(
      `  8. prod webhook GET: HTTP ${res.status} ` +
        (res.status === 403
          ? '✓ (route deployed and verifying tokens)'
          : res.status === 200
            ? '⚠ returned 200 to a wrong token?!'
            : res.status >= 300 && res.status < 400
              ? `✗ REDIRECT (${res.headers.get('location')}) — Meta must call the www URL directly`
              : '✗ unexpected')
    )
  } catch (e) {
    console.log(`  8. prod webhook GET failed: ${e instanceof Error ? e.message : e}`)
  }
}

main().catch((err) => { console.error('Unexpected failure:', err); process.exit(1) })
