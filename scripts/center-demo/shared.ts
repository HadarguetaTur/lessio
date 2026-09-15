/**
 * Shared plumbing for the "מרכז אופק ללמידה — DEMO" tenant scripts.
 *
 * The tenant is the former "סטודיו מיכל למוזיקה" video-demo org
 * (`d3000000-0000-4000-8000-000000000000`). The org row is never deleted —
 * its WhatsApp connection (once attached) lives on that row — so every script
 * here works *inside* the org: wipe business rows, seed new ones, leave the
 * organization identity and every `whatsapp_*` / `wa_*` column untouched.
 *
 * New rows use the `d3000001-` prefix (the original seed used `d3000000-`),
 * so the wipe can target them by id and the org row by exclusion.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const ORG_ID = 'd3000000-0000-4000-8000-000000000000'
export const TZ = 'Asia/Jerusalem'
export const OLD_ORG_NAME = 'סטודיו מיכל למוזיקה'
export const NEW_ORG_NAME = 'מרכז אופק ללמידה — DEMO'
export const NEW_ORG_SLUG = 'ofek-learning-center-demo'
export const OWNER_EMAIL = 'video-owner@demo.getlessio.com'
export const STAFF_EMAIL_DOMAIN = 'demo.getlessio.com'
export const NEW_PREFIX = 'd3000001'
/** Meta-verified recipient of the test number — the one parent that may receive live messages. */
export const VERIFIED_PARENT_PHONE = '+972504343547'

/** Columns that define the WhatsApp connection. Read before and after every run; must not change. */
export const WA_COLUMNS =
  'whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_business_id, whatsapp_access_token, ' +
  'whatsapp_number, whatsapp_token, wa_quality_rating, wa_messaging_limit_tier, wa_is_oba, wa_oba_status, ' +
  'wa_business_verification_status, wa_name_status, wa_health_checked_at, wa_connected_at, ' +
  'wa_verification_checklist, broadcasts_enabled, wa_health_error, wa_health_error_at, ' +
  'wa_account_restricted, wa_display_phone_number, wa_verified_name, ' +
  'payment_provider, payment_config_encrypted, receipt_provider, receipt_config_encrypted, receipt_mode, ' +
  'google_calendar_refresh_token, google_calendar_email, gmail_refresh_token, gmail_connected_email, ' +
  'ai_provider, ai_model, ai_config_encrypted'

// ── Entity type nibbles for deterministic ids ────────────────────────────────
export const T = {
  teacher: 0x0001,
  parent: 0x0002,
  student: 0x0003,
  group: 0x0004,
  series: 0x0005,
  lesson: 0x0006,
  subscription: 0x0007,
  homework: 0x0008,
  note: 0x0009,
  goal: 0x000a,
  exam: 0x000b,
  override: 0x000c,
  dayOff: 0x000d,
  waMessage: 0x000e,
  lead: 0x000f,
  cancelEvent: 0x0010,
  availability: 0x0011,
  takeover: 0x0012,
  submission: 0x0013,
  manualCharge: 0x0014,
  extraLesson: 0x0015,
} as const

export function uid(type: number, n: number): string {
  return `${NEW_PREFIX}-${type.toString(16).padStart(4, '0')}-4000-8000-${n.toString(16).padStart(12, '0')}`
}

// ── env ──────────────────────────────────────────────────────────────────────

export function loadEnvLocal(): void {
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

export function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

export async function expectOk(
  label: string,
  p: PromiseLike<{ error: { message: string } | null }>
): Promise<void> {
  const { error } = await p
  if (error) fail(`${label}: ${error.message}`)
}

export function arg(flag: string): string | undefined {
  const args = process.argv.slice(2)
  const i = args.indexOf(flag)
  if (i !== -1) return args[i + 1]
  const eq = args.find((a) => a.startsWith(`${flag}=`))
  return eq ? eq.slice(flag.length + 1) : undefined
}

/**
 * Service-role client. Refuses a remote Supabase unless CENTER_DEMO_ALLOW_REMOTE=1,
 * and refuses to run against any org but the fixed demo org.
 */
export function getClient(): SupabaseClient {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:|\/|$)/.test(url)
  if (!isLocal && process.env.CENTER_DEMO_ALLOW_REMOTE !== '1') {
    fail(`Refusing to touch a non-local Supabase: ${url} (set CENTER_DEMO_ALLOW_REMOTE=1 on purpose)`)
  }
  const orgArg = arg('--org-id')
  if (orgArg !== ORG_ID) {
    fail(`--org-id must be exactly ${ORG_ID} (got ${orgArg ?? 'nothing'})`)
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export type WaSnapshot = Record<string, unknown>

/** The org must exist and carry one of the two known names — anything else means the wrong project. */
export async function assertOrg(db: SupabaseClient): Promise<{ name: string; wa: WaSnapshot }> {
  const { data, error } = await db
    .from('organizations')
    .select(`id, name, ${WA_COLUMNS}`)
    .eq('id', ORG_ID)
    .maybeSingle()
  if (error) fail(`organizations lookup: ${error.message}`)
  if (!data) fail(`Organization ${ORG_ID} not found`)
  const row = data as unknown as { id: string; name: string } & WaSnapshot
  if (row.name !== OLD_ORG_NAME && row.name !== NEW_ORG_NAME) {
    fail(`Organization ${ORG_ID} is named "${row.name}" — expected "${OLD_ORG_NAME}" or "${NEW_ORG_NAME}"`)
  }
  const { id: _id, name, ...wa } = row
  void _id
  return { name, wa }
}

export function assertWaUnchanged(before: WaSnapshot, after: WaSnapshot): void {
  const diffs = Object.keys(before).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
  )
  if (diffs.length > 0) {
    fail(`Integration columns changed during the run: ${diffs.join(', ')} — STOP and inspect`)
  }
}

// ── data helpers ─────────────────────────────────────────────────────────────

export function chunk<Row>(rows: Row[], size: number): Row[][] {
  const out: Row[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

export async function upsertChunks(
  db: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict = 'id',
  size = 500
): Promise<number> {
  let n = 0
  for (const part of chunk(rows, size)) {
    const { error } = await db.from(table).upsert(part, { onConflict })
    if (error) fail(`upsert ${table} (${part.length} rows): ${error.message}`)
    n += part.length
  }
  return n
}

export async function insertChunks(
  db: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  size = 500
): Promise<number> {
  let n = 0
  for (const part of chunk(rows, size)) {
    const { error } = await db.from(table).insert(part)
    if (error) fail(`insert ${table} (${part.length} rows): ${error.message}`)
    n += part.length
  }
  return n
}

/** Paginated select — PostgREST caps a single response at max_rows (1000 in this project). */
export async function fetchAll<Row = Record<string, unknown>>(
  db: SupabaseClient,
  table: string,
  select: string,
  apply: (q: any) => any = (q) => q, // eslint-disable-line @typescript-eslint/no-explicit-any
  page = 1000
): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await apply(db.from(table).select(select)).range(from, from + page - 1)
    if (error) fail(`select ${table}: ${error.message}`)
    out.push(...((data ?? []) as Row[]))
    if (!data || data.length < page) break
  }
  return out
}

/** Deterministic PRNG (mulberry32) so every run produces the same dataset for the same size. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<V>(r: () => number, arr: readonly V[]): V {
  return arr[Math.floor(r() * arr.length)]
}

export function between(r: () => number, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1))
}

// ── auth ─────────────────────────────────────────────────────────────────────

export async function findUserByEmail(db: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) fail(`Failed to list auth users: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit.id
    if (data.users.length < 200) return null
  }
  return null
}

export async function ensureAuthUser(
  db: SupabaseClient,
  email: string,
  password: string,
  fullName: string
): Promise<string> {
  const existing = await findUserByEmail(db, email)
  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) fail(`Failed to update auth user ${email}: ${error.message}`)
    return existing
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data?.user) fail(`Failed to create auth user ${email}: ${error?.message}`)
  return data.user.id
}
