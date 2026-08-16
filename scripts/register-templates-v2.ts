/**
 * One-time rollout: register the rewritten `_v2` message templates on every
 * already-connected WABA.
 *
 * Context: Sprint 32 rewrote the Hebrew copy of all Meta-approved templates and
 * added an English set for the bilingual bot. Editing an approved template
 * resets it to PENDING and blocks out-of-window sends until Meta re-approves,
 * so the new copy ships under new `_v2` names (see
 * src/lib/whatsapp/registerTemplates.ts). Orgs that connected before this change
 * only have the old templates on their WABA — this script registers the new set
 * for them. New connections get it automatically via registerTemplatesForWABA
 * in the Embedded Signup flow.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/register-templates-v2.ts
 *
 * Required env (read from the environment, falling back to .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WHATSAPP_TOKEN_ENCRYPTION_KEY
 *
 * Safe to re-run: registerOne treats a duplicate-name response as success.
 * Templates land in PENDING and are usually auto-approved within minutes;
 * until then sendSmartMessage keeps falling back to plain text in-window.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '../src/lib/crypto'
import { registerTemplatesForWABA, TEMPLATES } from '../src/lib/whatsapp/registerTemplates'

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
  console.log(`Registering ${TEMPLATES.length} template(s) on ${orgs.length} connected WABA(s):`)
  for (const t of TEMPLATES) console.log(`  · ${t.name}`)
  console.log('')

  let ok = 0
  let failed = 0

  for (const org of orgs) {
    const label = `${org.name ?? '(unnamed)'} [org ${org.id}, WABA ${org.whatsapp_waba_id}]`

    try {
      const accessToken = decryptToken(org.whatsapp_access_token)
      const result = await registerTemplatesForWABA(org.whatsapp_waba_id, accessToken)

      console.log(`${result.failed.length === 0 ? '✓' : '⚠'} ${label}`)
      for (const name of result.ok) console.log(`    ok   ${name}`)
      for (const f of result.failed) {
        // Surface Meta's own explanation — the raw error text is unreadable.
        const subcode = f.reason.match(/"error_subcode":(\d+)/)?.[1] ?? '?'
        const msg = f.reason.match(/"error_user_msg":"([^"]*)"/)?.[1] ?? ''
        let decoded = msg
        try {
          decoded = JSON.parse(`"${msg}"`)
        } catch {
          /* keep raw */
        }
        console.log(`    FAIL ${f.name} — subcode ${subcode}: ${decoded}`)
      }

      if (result.failed.length > 0) failed++
      else ok++
    } catch (err) {
      console.error(`✗ ${label} — ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }
  }

  console.log(`\nDone: ${ok} org(s) fully registered, ${failed} with failures`)
  console.log('Check approval status in Meta Business Manager → WhatsApp Manager → Message Templates.')
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
