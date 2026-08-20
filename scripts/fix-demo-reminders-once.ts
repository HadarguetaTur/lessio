/**
 * One-off fix for the review-demo tenants (2026-08-20). Safe to delete after running.
 *
 *  1. Opts out the 11 fictional 555-01xx parents so the reminder crons stop
 *     firing doomed #131030 sends (mirrors the change now baked into
 *     seed-review-demo.ts — this applies it to the already-seeded rows).
 *  2. Deletes the failed lesson_reminder rows from notification_log so
 *     /settings/reminders is clean for App Review.
 *
 * Scope: orgs d2000000-/d2000002- only. Rachel Adams (the verified number)
 * is untouched. Usage: npx tsx scripts/fix-demo-reminders-once.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const eq = line.indexOf('=')
  if (eq === -1 || line.trim().startsWith('#')) continue
  const k = line.slice(0, eq).trim()
  if (!process.env[k]) process.env[k] = line.slice(eq + 1).trim()
}

const ORGS = ['d2000000-0000-4000-8000-000000000000', 'd2000002-0000-4000-8000-000000000000']

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: optedOut, error: e1 } = await db
    .from('parents')
    .update({ opted_out_at: new Date().toISOString() })
    .in('organization_id', ORGS)
    .like('phone', '+120255501%')
    .select('full_name, phone, organization_id')
  if (e1) throw new Error(`parents update failed: ${e1.message}`)
  console.log(`✓ ${optedOut!.length} fictional parents opted out`)
  for (const p of optedOut!) {
    console.log(`   ${p.full_name}  ${p.phone}  (${p.organization_id.slice(0, 9)})`)
  }

  const { data: deleted, error: e2 } = await db
    .from('notification_log')
    .delete()
    .in('organization_id', ORGS)
    .eq('status', 'failed')
    .select('type, entity_id, sent_at')
  if (e2) throw new Error(`notification_log delete failed: ${e2.message}`)
  console.log(`✓ ${deleted!.length} failed notification_log rows deleted`)
  for (const r of deleted!) console.log(`   ${r.type}  ${r.entity_id}  ${r.sent_at}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
