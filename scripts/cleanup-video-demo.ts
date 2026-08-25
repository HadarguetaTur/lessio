/**
 * Tear down the Hebrew video demo tenant created by scripts/seed-video-demo.ts.
 *
 * Deletes every row under the d3000000- prefix and the four auth users, in
 * dependency order. Same local-only guard as the seed script.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service role> \
 *   npx tsx scripts/cleanup-video-demo.ts --yes
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const ORG_ID = 'd3000000-0000-4000-8000-000000000000'

const EMAILS = [
  'video-owner@demo.getlessio.com',
  'michal@demo.getlessio.com',
  'yonatan@demo.getlessio.com',
  'dana@demo.getlessio.com',
]

/**
 * Child tables first — lesson_students and homework_submissions reference rows
 * in tables listed after them.
 */
const TABLES = [
  'lesson_students',
  'homework_submissions',
  'charges',
  'student_monthly_billing',
  'student_cancellation_events',
  'lesson_notes',
  'homework_assignments',
  'student_goals',
  'subscriptions',
  'lessons',
  'notification_log',
  'relationships',
  'students',
  'parents',
  'availability',
  'teachers',
  'organization_subscriptions',
  'cancellation_policies',
  'profiles',
]

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

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

async function findUserByEmail(db: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) fail(`Failed to list auth users: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit.id
    if (data.users.length < 200) return null
  }
  return null
}

async function main(): Promise<void> {
  loadEnvLocal()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:|\/|$)/.test(
    supabaseUrl
  )
  if (!isLocal && process.env.VIDEO_DEMO_ALLOW_REMOTE !== '1') {
    fail(`Refusing to delete from a non-local Supabase: ${supabaseUrl}`)
  }
  if (!process.argv.includes('--yes')) {
    fail('Pass --yes to confirm deleting the video demo tenant')
  }

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  console.log(`\nDeleting video demo tenant from ${supabaseUrl}`)
  for (const table of TABLES) {
    const { error } = await db.from(table).delete().eq('organization_id', ORG_ID)
    // profiles is keyed by organization_id too, but a table without the column
    // simply reports it — worth showing rather than swallowing.
    if (error) console.warn(`  ⚠ ${table}: ${error.message}`)
    else console.log(`  ✓ ${table}`)
  }

  const { error: orgError } = await db.from('organizations').delete().eq('id', ORG_ID)
  if (orgError) console.warn(`  ⚠ organizations: ${orgError.message}`)
  else console.log('  ✓ organizations')

  for (const email of EMAILS) {
    const id = await findUserByEmail(db, email)
    if (!id) continue
    const { error } = await db.auth.admin.deleteUser(id)
    if (error) console.warn(`  ⚠ auth ${email}: ${error.message}`)
    else console.log(`  ✓ auth ${email}`)
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
