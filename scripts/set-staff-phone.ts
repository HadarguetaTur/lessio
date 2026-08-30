/**
 * Put a phone number on an owner/admin profile, so that phone can talk to the
 * bot as staff (day-off approvals, support requests, the owner copilot).
 *
 * Why a script: profiles.phone is written by exactly one form in the app — the
 * Teachers page — so an owner or admin has no way to register their own number
 * from the dashboard. Without it resolveSender() cannot see them as staff and
 * every message they send falls through to the "unknown number" lead reply.
 *
 * Usage (from the repo root):
 *   STAFF_PHONE=0501234567 npx tsx scripts/set-staff-phone.ts
 *   STAFF_PHONE=0501234567 STAFF_EMAIL=someone@example.com npx tsx scripts/set-staff-phone.ts
 *
 * Required env (read from the environment, falling back to .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STAFF_PHONE                     ← 05XXXXXXXX / 9725XXXXXXXX / +9725XXXXXXXX
 * Optional env:
 *   STAFF_EMAIL                     (default: reviewer@getlessio.com — the App
 *                                    Review demo tenant, scripts/seed-review-demo.ts)
 *   CLEAR=1                         ← remove the phone instead of setting it
 *
 * Safe to re-run: a single idempotent UPDATE. Reversible with CLEAR=1.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone, PhoneNormalizationError } from '../src/lib/phone'

const DEFAULT_STAFF_EMAIL = 'reviewer@getlessio.com'

function createDb(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type Db = ReturnType<typeof createDb>
type NamedRow = { full_name: string | null }

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

/**
 * Every capacity in this org that already answers on this number.
 *
 * Staff is last in ROLE_PRECEDENCE (src/lib/whatsapp/sender.ts), so a phone
 * that is also a parent, student or teacher keeps landing in that flow — the
 * copilot stays unreachable until the sender switches role from the bot menu.
 */
async function findConflicts(
  db: Db,
  orgId: string,
  phone: string
): Promise<string[]> {
  const [parents, students, teachers] = await Promise.all([
    db.from('parents').select('full_name').eq('organization_id', orgId).eq('phone', phone).eq('is_active', true),
    db.from('students').select('full_name').eq('organization_id', orgId).eq('phone', phone).eq('is_active', true),
    db
      .from('teachers')
      .select('id, profiles!inner ( full_name, phone )')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .eq('profiles.phone', phone),
  ])

  const conflicts: string[] = []
  for (const row of (parents.data ?? []) as NamedRow[]) conflicts.push(`parent "${row.full_name}"`)
  for (const row of (students.data ?? []) as NamedRow[]) conflicts.push(`student "${row.full_name}"`)
  if ((teachers.data ?? []).length > 0) conflicts.push('teacher')
  return conflicts
}

async function main(): Promise<void> {
  loadEnvLocal()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const email = process.env.STAFF_EMAIL ?? DEFAULT_STAFF_EMAIL
  const clearing = process.env.CLEAR === '1'
  const rawPhone = process.env.STAFF_PHONE

  let phone: string | null = null
  if (!clearing) {
    if (!rawPhone) {
      console.error('Missing STAFF_PHONE (or pass CLEAR=1 to remove the number)')
      process.exit(1)
    }
    try {
      phone = normalizePhone(rawPhone)
    } catch (err) {
      if (err instanceof PhoneNormalizationError) {
        console.error(`${err.message}\nOnly Israeli mobiles are accepted — the webhook drops anything else.`)
        process.exit(1)
      }
      throw err
    }
  }

  const db = createDb(supabaseUrl, serviceRoleKey)

  console.log(`Supabase project: ${supabaseUrl}`)

  // 1. Resolve the person by their login email.
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) {
    console.error('Failed to list auth users:', listErr.message)
    process.exit(1)
  }
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(`No auth user found for ${email}`)
    process.exit(1)
  }

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, organization_id, full_name, role, phone, is_active')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr || !profile) {
    console.error(`No profile for ${email}: ${profileErr?.message ?? 'not found'}`)
    process.exit(1)
  }

  const { data: org } = await db
    .from('organizations')
    .select('name')
    .eq('id', profile.organization_id as string)
    .single()

  console.log(
    `✓ Profile: ${profile.full_name} <${email}> — role ${profile.role}, org "${org?.name ?? '?'}" [${profile.organization_id}]`
  )
  console.log(`  current phone: ${profile.phone ?? '(none)'}`)

  // 2. Only owner/admin are looked up as staff by resolveSender().
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    console.error(`Role is "${profile.role}" — the bot only resolves owner/admin as staff.`)
    process.exit(1)
  }
  if (profile.is_active === false) {
    console.error('Profile is inactive — resolveSender() filters on is_active.')
    process.exit(1)
  }

  if (clearing) {
    const { error } = await db.from('profiles').update({ phone: null }).eq('id', profile.id as string)
    if (error) {
      console.error('Failed to clear the phone:', error.message)
      process.exit(1)
    }
    console.log('✓ Phone cleared.')
    return
  }

  // 3. Warn before writing: another capacity on the same number wins the lookup.
  const conflicts = await findConflicts(db, profile.organization_id as string, phone!)
  if (conflicts.length > 0) {
    console.warn(`⚠  ${phone} is also ${conflicts.join(', ')} in this org.`)
    console.warn('   Those win over staff, so the bot will answer in that role until you')
    console.warn('   tap "switch role" in the menu and choose staff.')
  }

  // 4. Write.
  const { error: updateErr } = await db
    .from('profiles')
    .update({ phone })
    .eq('id', profile.id as string)
  if (updateErr) {
    console.error('Failed to update the profile:', updateErr.message)
    process.exit(1)
  }

  const { data: after } = await db
    .from('profiles')
    .select('phone')
    .eq('id', profile.id as string)
    .maybeSingle()

  console.log(`✓ Phone set to ${after?.phone}`)
  console.log('\nNext: make sure the org has the AI assistant on and a key at /settings/ai-assistant,')
  console.log('then text the business number from this phone (e.g. "כמה חייבים לי?").')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
