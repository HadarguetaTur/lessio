/**
 * Remove the Meta App Review demo tenant created by scripts/seed-review-demo.ts.
 *
 * Run this once App Review has been approved. It deletes the Brightpath Tutoring
 * organization (fixed id d2000000-0000-4000-8000-000000000000) and the four
 * fictitious Auth users, and nothing else — the Hebrew demo data under the
 * d1000000- prefix in Hadar's own org is untouched.
 *
 * Child tables are deleted explicitly before the organization row rather than
 * relying on the cascade: several foreign keys (charges.parent_id,
 * charges.lesson_id, lessons.teacher_id, homework_assignments.teacher_id,
 * student_goals.created_by) carry no ON DELETE rule, so a single cascading
 * delete of the org can trip a NO ACTION check. Everything after that step does
 * cascade cleanly from organizations.
 *
 * Usage: npx tsx scripts/cleanup-review-demo.ts --yes
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const ORG_ID = 'd2000000-0000-4000-8000-000000000000'
const EXPECTED_ORG_NAME = 'Brightpath Tutoring'

const DEMO_EMAILS = [
  process.env.REVIEW_DEMO_OWNER_EMAIL ?? 'reviewer@getlessio.com',
  'sarah.klein@demo.getlessio.com',
  'david.mor@demo.getlessio.com',
  'noa.barak@demo.getlessio.com',
]

/** Deleted in this order; each references something deleted after it. */
const CHILD_TABLES = [
  'charges',
  'student_monthly_billing',
  'student_cancellation_events',
  'lesson_notes',
  'homework_submissions',
  'homework_assignments',
  'homework_templates',
  'student_goals',
  'subscriptions',
  'lesson_students',
  'lessons',
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

  if (!process.argv.includes('--yes')) {
    fail(
      'This permanently deletes the review demo org and its four Auth users.\n' +
        '  Re-run with --yes once App Review has been approved.'
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // Guard: only ever delete the org this script was written for.
  const { data: org } = await db
    .from('organizations')
    .select('id, name, whatsapp_phone_number_id')
    .eq('id', ORG_ID)
    .maybeSingle()

  if (!org) {
    console.log('✓ Demo org already gone — checking for leftover Auth users only.')
  } else {
    if (org.name !== EXPECTED_ORG_NAME) {
      fail(`Org ${ORG_ID} is named "${org.name}", expected "${EXPECTED_ORG_NAME}". Refusing to delete.`)
    }
    if (org.whatsapp_phone_number_id) {
      console.warn(
        `⚠ The org still holds WhatsApp number ${org.whatsapp_phone_number_id}. ` +
          'Disconnect the test number in the Meta dashboard as well.'
      )
    }

    console.log(`\n▸ Deleting data for "${org.name}"`)
    for (const table of CHILD_TABLES) {
      const { error } = await db.from(table).delete().eq('organization_id', ORG_ID)
      if (error) {
        // lesson_students only gained organization_id in a later migration; a
        // missing column there is expected and harmless (it cascades from lessons).
        if (error.code === '42703' || error.code === '42P01') {
          console.log(`  – ${table}: skipped (${error.code})`)
          continue
        }
        fail(`Failed to clear ${table}: ${error.message}`)
      }
      console.log(`  ✓ ${table}`)
    }

    const { error: orgError } = await db.from('organizations').delete().eq('id', ORG_ID)
    if (orgError) fail(`Failed to delete organization: ${orgError.message}`)
    console.log('  ✓ organizations (cascaded profiles, teachers, parents, students, settings)')
  }

  console.log('\n▸ Deleting Auth users')
  for (const email of DEMO_EMAILS) {
    const userId = await findUserByEmail(db, email)
    if (!userId) {
      console.log(`  – ${email}: not found`)
      continue
    }
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) fail(`Failed to delete ${email}: ${error.message}`)
    console.log(`  ✓ ${email}`)
  }

  console.log(
    '\nDone. Remaining manual steps:\n' +
      '  • Disconnect the Meta test number from the app dashboard\n' +
      '  • Remove DEMO_RESCHEDULE_ENABLED / DEMO_PAYMENT_LINK_ENABLED from Vercel\n' +
      '  • Clean up the Hebrew demo rows (prefix d1000000-) in Hadar\'s own org'
  )
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
