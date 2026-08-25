/**
 * End-to-end setup of a REAL phone number on the Lessio WABA and its connection
 * to a tenant org — the manual path that bypasses Embedded Signup (which needs
 * an approved App Review). First used to onboard רז מזוריק (2026-08-25).
 *
 * The flow is five explicit steps because two of them are interactive
 * (the SMS code arrives on the physical SIM; the org write touches prod):
 *
 *   npx tsx scripts/whatsapp-number-setup.ts list
 *   npx tsx scripts/whatsapp-number-setup.ts add --cc 972 --number 5XXXXXXXX --name "שם עסקי"
 *   npx tsx scripts/whatsapp-number-setup.ts request-code --phone-id <id>   # SMS to the SIM
 *   npx tsx scripts/whatsapp-number-setup.ts verify --phone-id <id> --code 123456
 *   npx tsx scripts/whatsapp-number-setup.ts register --phone-id <id>       # uses WHATSAPP_REGISTER_PIN
 *   npx tsx scripts/whatsapp-number-setup.ts connect --phone-id <id> --org <org-uuid>
 *
 * Required env (environment, falling back to .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (connect step only)
 *   WHATSAPP_TOKEN_ENCRYPTION_KEY                          (connect step only —
 *     MUST equal the Vercel value: encrypted here, decrypted by the prod webhook)
 *   WHATSAPP_SYSTEM_USER_TOKEN or WHATSAPP_DEMO_ACCESS_TOKEN  (permanent System User token)
 *   WHATSAPP_REGISTER_PIN                                  (register step only)
 * Optional env:
 *   WHATSAPP_WABA_ID  (default: 1066332709132512 — the Lessio WABA)
 *
 * Safe to re-run any step: Graph calls are idempotent-ish (Meta returns a clear
 * error if the state is already advanced), the DB write is a plain UPDATE.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { encryptToken } from '../src/lib/crypto'
import { subscribeAppToWABA, getSubscribedApps } from '../src/lib/whatsapp/subscribeApp'
import { META_API_VERSION } from '../src/lib/whatsapp/graphVersion'

const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`
const DEFAULT_WABA_ID = '1066332709132512'

// ── Minimal .env.local loader (same as connect-demo-whatsapp.ts) ──────────────

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

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function requireArg(name: string): string {
  const v = arg(name)
  if (!v) {
    console.error(`Missing required argument --${name}`)
    process.exit(1)
  }
  return v
}

// ── Graph helper ──────────────────────────────────────────────────────────────

async function graph(
  method: 'GET' | 'POST',
  path: string,
  token: string,
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH_BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = (json as { error?: { message?: string; error_user_msg?: string } }).error
    throw new Error(
      `Graph ${method} /${path} failed (${res.status}): ${err?.error_user_msg ?? err?.message ?? JSON.stringify(json)}`
    )
  }
  return json
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal()

  const token =
    process.env.WHATSAPP_SYSTEM_USER_TOKEN ?? process.env.WHATSAPP_DEMO_ACCESS_TOKEN
  if (!token) {
    console.error('Missing WHATSAPP_SYSTEM_USER_TOKEN / WHATSAPP_DEMO_ACCESS_TOKEN')
    process.exit(1)
  }
  const wabaId = process.env.WHATSAPP_WABA_ID ?? DEFAULT_WABA_ID
  const step = process.argv[2]

  switch (step) {
    case 'list': {
      const res = await graph(
        'GET',
        `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,status,name_status`,
        token
      )
      console.log(JSON.stringify(res.data, null, 2))
      return
    }

    case 'add': {
      const cc = requireArg('cc')
      const number = requireArg('number')
      const name = requireArg('name')
      const res = await graph('POST', `${wabaId}/phone_numbers`, token, {
        cc,
        phone_number: number,
        verified_name: name,
      })
      console.log(`✓ Number added to WABA ${wabaId}. phone_number_id: ${res.id}`)
      console.log('Next: request-code --phone-id ' + res.id)
      return
    }

    case 'request-code': {
      const phoneId = requireArg('phone-id')
      const method = arg('method') ?? 'SMS'
      const lang = arg('lang') ?? 'he_IL'
      await graph('POST', `${phoneId}/request_code`, token, {
        code_method: method,
        language: lang,
      })
      console.log(`✓ Verification code requested via ${method}. Check the SIM, then run:`)
      console.log(`  verify --phone-id ${phoneId} --code <the 6-digit code>`)
      return
    }

    case 'verify': {
      const phoneId = requireArg('phone-id')
      const code = requireArg('code')
      await graph('POST', `${phoneId}/verify_code`, token, { code })
      console.log('✓ Number verified. Next: register --phone-id ' + phoneId)
      return
    }

    case 'register': {
      const phoneId = requireArg('phone-id')
      const pin = process.env.WHATSAPP_REGISTER_PIN
      if (!pin) {
        console.error('Missing WHATSAPP_REGISTER_PIN')
        process.exit(1)
      }
      await graph('POST', `${phoneId}/register`, token, {
        messaging_product: 'whatsapp',
        pin,
      })
      console.log('✓ Number registered on Cloud API. Next: connect --phone-id ' + phoneId + ' --org <uuid>')
      return
    }

    case 'connect': {
      const phoneId = requireArg('phone-id')
      const orgId = requireArg('org')

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      const encryptionKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY
      if (!supabaseUrl || !serviceRoleKey || !encryptionKey) {
        console.error(
          'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / WHATSAPP_TOKEN_ENCRYPTION_KEY'
        )
        process.exit(1)
      }
      console.log(
        `⚠  WHATSAPP_TOKEN_ENCRYPTION_KEY fingerprint: ${encryptionKey.slice(0, 4)}…${encryptionKey.slice(-4)} — must match Vercel.`
      )

      // Fail fast if the number is not actually live on this WABA.
      const info = (await graph(
        'GET',
        `${phoneId}?fields=id,display_phone_number,verified_name,status`,
        token
      )) as { display_phone_number?: string; verified_name?: string; status?: string }
      console.log(
        `✓ Number ${info.display_phone_number} (${info.verified_name ?? 'no name yet'}) status=${info.status}`
      )

      const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

      const { data: org, error: orgErr } = await db
        .from('organizations')
        .select('id, name')
        .eq('id', orgId)
        .single()
      if (orgErr || !org) {
        console.error(`Org ${orgId} not found: ${orgErr?.message ?? 'no row'}`)
        process.exit(1)
      }
      console.log(`✓ Target org: "${org.name}" [${org.id}]`)

      // whatsapp_phone_number_id is UNIQUE — release the full connection from
      // any other org that still holds this number (see connect-demo-whatsapp.ts).
      const { data: holders } = await db
        .from('organizations')
        .select('id, name')
        .eq('whatsapp_phone_number_id', phoneId)
        .neq('id', orgId)
      for (const holder of holders ?? []) {
        console.warn(`⚠  Releasing ${phoneId} from org "${holder.name}" [${holder.id}]`)
        const { error: releaseErr } = await db
          .from('organizations')
          .update({
            whatsapp_phone_number_id: null,
            whatsapp_waba_id: null,
            whatsapp_access_token: null,
          })
          .eq('id', holder.id)
        if (releaseErr) {
          console.error(`Failed to release: ${releaseErr.message}`)
          process.exit(1)
        }
      }

      const { error: updateErr } = await db
        .from('organizations')
        .update({
          whatsapp_phone_number_id: phoneId,
          whatsapp_waba_id: wabaId,
          whatsapp_access_token: encryptToken(token),
        })
        .eq('id', orgId)
      if (updateErr) {
        console.error('Failed to update organization:', updateErr.message)
        process.exit(1)
      }
      console.log(`✓ Connection saved on org "${org.name}"`)

      try {
        await subscribeAppToWABA(wabaId, token)
      } catch (err) {
        console.warn(`⚠  subscribeAppToWABA: ${err instanceof Error ? err.message : String(err)}`)
      }
      const apps = await getSubscribedApps(wabaId, token).catch(() => [])
      if (apps.length === 0) {
        console.warn('⚠  subscribed_apps is EMPTY — inbound messages will NOT arrive. Fix in App Dashboard → WhatsApp → Configuration.')
      } else {
        console.log(`✓ WABA subscribed_apps OK (${apps.length})`)
      }

      console.log(
        '\nDone. Smoke test:\n' +
          `  1. Send "היי" from a parent phone to ${info.display_phone_number} — the bot should answer.\n` +
          `  2. Portal login: https://www.getlessio.com/portal/${orgId}/login — OTP arrives on WhatsApp.\n` +
          '     (Until the lessio_otp_* templates exist on the WABA, the OTP falls back to plain\n' +
          '     text, which only works inside an open 24h window — have the parent message the\n' +
          '     bot first.)'
      )
      return
    }

    default:
      console.error(
        'Usage: npx tsx scripts/whatsapp-number-setup.ts <list|add|request-code|verify|register|connect> [--flags]'
      )
      process.exit(1)
  }
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
