/**
 * Generate the Graph API traffic Meta's App Review "API pre-check" step requires.
 *
 * Context: App Review marks `api_precheck` incomplete until it sees successful
 * calls made with each requested permission. As of the last check the app had
 * 0 calls in 30 days, so the step can never pass on its own — production traffic
 * goes through the *system user* token of connected orgs, not this app's
 * developer token, and the demo number is the only live WABA.
 *
 * This script exercises both requested permissions against the demo WABA:
 *   whatsapp_business_management  → read templates / phone numbers / subscriptions
 *   whatsapp_business_messaging   → send a real message to the verified recipient
 *
 * `business_management` is deliberately absent: no production code path needs it.
 * Per Meta's Embedded Signup docs a Cloud API flow needs only the two WhatsApp
 * permissions — business_management is for Solution Partners sharing a credit
 * line, which Lessio does not do.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/meta-precheck-calls.ts          # read-only calls + one send
 *   npx tsx scripts/meta-precheck-calls.ts --no-send # skip the outbound message
 *
 * Required env (read from the environment, falling back to .env.local):
 *   WHATSAPP_DEMO_ACCESS_TOKEN — 24h token from App Dashboard → WhatsApp → API Setup.
 *     It expires daily; a 401 here means it needs refreshing, nothing more.
 *
 * Safe to re-run. The only write is a single WhatsApp message to the verified
 * demo recipient, which is exactly the traffic the reviewer expects to see.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { META_API_VERSION } from '../src/lib/whatsapp/graphVersion'

const API_VERSION = process.env.META_API_VERSION ?? META_API_VERSION
const WABA_ID = '1066332709132512'
const PHONE_NUMBER_ID = '1338080832713619'
const DEMO_RECIPIENT = '+972504343547'

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

type CallResult = {
  permission: string
  label: string
  ok: boolean
  status: number
  detail: string
}

const results: CallResult[] = []

async function call(
  permission: string,
  label: string,
  path: string,
  token: string,
  init?: RequestInit
): Promise<Record<string, unknown> | null> {
  const url = `https://graph.facebook.com/${API_VERSION}/${path}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
    const body = (await res.json()) as Record<string, unknown>
    const detail = res.ok
      ? summarise(body)
      : ((body.error as Record<string, unknown> | undefined)?.message as string) ?? 'unknown error'
    results.push({ permission, label, ok: res.ok, status: res.status, detail })
    console.log(`${res.ok ? '✓' : '✗'} [${permission}] ${label} — HTTP ${res.status} ${detail}`)
    return res.ok ? body : null
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    results.push({ permission, label, ok: false, status: 0, detail })
    console.log(`✗ [${permission}] ${label} — request failed: ${detail}`)
    return null
  }
}

function summarise(body: Record<string, unknown>): string {
  if (Array.isArray(body.data)) return `${body.data.length} item(s)`
  if (typeof body.name === 'string') return body.name
  if (typeof body.display_phone_number === 'string') return body.display_phone_number
  if (Array.isArray(body.messages)) return 'message queued'
  if (typeof body.id === 'string') return `id ${body.id}`
  return 'ok'
}

async function main(): Promise<void> {
  loadEnvLocal()

  const token = process.env.WHATSAPP_DEMO_ACCESS_TOKEN
  if (!token) {
    console.error(
      'Missing WHATSAPP_DEMO_ACCESS_TOKEN.\n' +
        'Get a fresh 24h token: App Dashboard → WhatsApp → API Setup → Temporary access token,\n' +
        'then put it in .env.local as WHATSAPP_DEMO_ACCESS_TOKEN=...'
    )
    process.exit(1)
  }

  const skipSend = process.argv.includes('--no-send')
  console.log(`Graph ${API_VERSION} · WABA ${WABA_ID} · phone_number_id ${PHONE_NUMBER_ID}\n`)

  // ── whatsapp_business_management ────────────────────────────────────────────
  const templates = await call(
    'whatsapp_business_management',
    'GET /{waba}/message_templates',
    `${WABA_ID}/message_templates?fields=name,status,language,category&limit=100`,
    token
  )
  if (!templates && results[0]?.status === 401) {
    console.error('\nToken is expired or invalid — refresh it in API Setup and re-run.')
    process.exit(1)
  }

  await call(
    'whatsapp_business_management',
    'GET /{waba}/phone_numbers',
    `${WABA_ID}/phone_numbers?fields=display_phone_number,verified_name,quality_rating`,
    token
  )
  await call(
    'whatsapp_business_management',
    'GET /{waba}/subscribed_apps',
    `${WABA_ID}/subscribed_apps`,
    token
  )

  // owner_business_info is omitted on purpose — it is the one field here that
  // would require business_management.
  await call(
    'whatsapp_business_management',
    'GET /{waba} (settings)',
    `${WABA_ID}?fields=id,name,timezone_id,message_template_namespace`,
    token
  )

  // ── whatsapp_business_messaging ─────────────────────────────────────────────
  await call(
    'whatsapp_business_messaging',
    'GET /{phone_number_id}',
    `${PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
    token
  )

  if (skipSend) {
    console.log('· [whatsapp_business_messaging] outbound send skipped (--no-send)')
  } else {
    const approved = (
      (templates?.data as Array<Record<string, unknown>> | undefined) ?? []
    ).filter((t) => t.status === 'APPROVED')

    // Prefer an approved template: it proves out-of-window sending, which is the
    // capability reviewers actually care about. Plain text only lands inside the
    // 24h customer-service window.
    const preferred =
      approved.find((t) => t.name === 'lessio_lesson_reminder_he_v2') ??
      approved.find((t) => String(t.name).startsWith('lessio_lesson_reminder_he')) ??
      approved[0]

    if (preferred) {
      const name = String(preferred.name)
      const language = String(preferred.language)
      const paramCount = /reminder/.test(name) ? 3 : 2
      const params = ['שרה כהן', 'יום שני 18/8', '16:00'].slice(0, paramCount)
      await call(
        'whatsapp_business_messaging',
        `POST /{phone_number_id}/messages (template ${name})`,
        `${PHONE_NUMBER_ID}/messages`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: DEMO_RECIPIENT,
            type: 'template',
            template: {
              name,
              language: { code: language },
              components: [
                { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
              ],
            },
          }),
        }
      )
    } else {
      console.log('· No APPROVED template found — falling back to a text send (needs an open 24h window).')
      await call(
        'whatsapp_business_messaging',
        'POST /{phone_number_id}/messages (text)',
        `${PHONE_NUMBER_ID}/messages`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: DEMO_RECIPIENT,
            type: 'text',
            text: { body: 'Lessio App Review pre-check — automated verification message.' },
          }),
        }
      )
    }
  }

  // ── Summary per permission ──────────────────────────────────────────────────
  console.log('\n── Pre-check coverage ──')
  let allCovered = true
  for (const permission of [
    'whatsapp_business_management',
    'whatsapp_business_messaging',
  ]) {
    const forPermission = results.filter((r) => r.permission === permission)
    const okCount = forPermission.filter((r) => r.ok).length
    const covered = okCount > 0
    if (!covered) allCovered = false
    console.log(
      `${covered ? '✓' : '✗'} ${permission}: ${okCount}/${forPermission.length} successful call(s)`
    )
    for (const r of forPermission.filter((x) => !x.ok)) {
      console.log(`    ✗ ${r.label} — ${r.detail}`)
    }
  }

  console.log(
    allCovered
      ? '\nBoth permissions now have successful calls on record.\n' +
          'Meta refreshes the pre-check with a delay — re-check App Review status in a few hours.'
      : '\nSome permissions still have no successful call. Fix the failures above and re-run.'
  )
  if (!allCovered) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
