/**
 * Export every row the demo org owns to JSON, one file per table, plus the
 * organizations row and the org's auth users. This is the rollback baseline
 * for wipe.ts / seed.ts.
 *
 * Usage:
 *   CENTER_DEMO_ALLOW_REMOTE=1 npx tsx scripts/center-demo/snapshot.ts \
 *     --org-id d3000000-0000-4000-8000-000000000000 --out <dir>
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getClient, assertOrg, fetchAll, arg, fail, ORG_ID } from './shared'

/** Every public table with an organization_id column (from information_schema, 14.09.2026). */
export const ORG_TABLES = [
  'ai_usage_log', 'api_request_log', 'availability', 'availability_overrides', 'availability_tail_prompts',
  'broadcast_campaigns', 'broadcast_list_members', 'broadcast_lists', 'broadcast_recipients',
  'cancellation_policies', 'cancellation_sessions', 'charge_audit_log', 'charge_payment_references',
  'charge_payments', 'charges', 'conversation_log', 'copilot_sessions', 'data_deletion_requests',
  'day_off_requests', 'exam_report_sessions', 'homework_assignments', 'homework_attachments',
  'homework_submissions', 'homework_templates', 'import_batches', 'in_app_notifications', 'leads',
  'lesson_notes', 'lesson_series', 'lesson_students', 'lessons', 'message_templates', 'notification_log',
  'org_bot_strings', 'organization_api_keys', 'organization_holiday_dismissals', 'organization_holidays',
  'organization_subscriptions', 'parents', 'payment_requests', 'portal_messages', 'portal_otps', 'profiles',
  'relationships', 'saas_invoices', 'saas_plan_inquiries', 'slot_locks', 'student_cancellation_events',
  'student_exams', 'student_goals', 'student_group_invites', 'student_groups', 'student_monthly_billing',
  'student_quota_overrides', 'students', 'subscriptions', 'support_sessions', 'support_tickets', 'teachers',
  'whatsapp_messages', 'whatsapp_processed_messages', 'whatsapp_sender_preference',
  'whatsapp_takeovers', 'whatsapp_template_statuses', 'whatsapp_usage_cache',
]

async function main(): Promise<void> {
  const db = getClient()
  const out = arg('--out')
  if (!out) fail('--out <dir> is required')
  mkdirSync(out, { recursive: true })

  const { name } = await assertOrg(db)
  console.log(`Snapshot of "${name}" [${ORG_ID}] → ${out}`)

  const { data: org, error: orgErr } = await db.from('organizations').select('*').eq('id', ORG_ID).single()
  if (orgErr) fail(`organizations: ${orgErr.message}`)
  writeFileSync(join(out, 'organizations.json'), JSON.stringify([org], null, 1))

  const counts: Record<string, number> = {}
  for (const table of ORG_TABLES) {
    const rows = await fetchAll(db, table, '*', (q) => q.eq('organization_id', ORG_ID))
    counts[table] = rows.length
    if (rows.length > 0) writeFileSync(join(out, `${table}.json`), JSON.stringify(rows, null, 1))
  }

  // student_group_members has no organization_id — reach it through the groups.
  const groupIds = (await fetchAll<{ id: string }>(db, 'student_groups', 'id', (q) => q.eq('organization_id', ORG_ID))).map((g) => g.id)
  if (groupIds.length > 0) {
    const members = await fetchAll(db, 'student_group_members', '*', (q) => q.in('group_id', groupIds))
    counts.student_group_members = members.length
    writeFileSync(join(out, 'student_group_members.json'), JSON.stringify(members, null, 1))
  }

  // Auth users behind this org's profiles (id + email only; passwords are not exportable).
  const profileIds = new Set(
    (await fetchAll<{ id: string }>(db, 'profiles', 'id', (q) => q.eq('organization_id', ORG_ID))).map((p) => p.id)
  )
  const users: Array<{ id: string; email: string | undefined; user_metadata: unknown }> = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) fail(`listUsers: ${error.message}`)
    for (const u of data.users) {
      if (profileIds.has(u.id)) users.push({ id: u.id, email: u.email, user_metadata: u.user_metadata })
    }
    if (data.users.length < 200) break
  }
  writeFileSync(join(out, 'auth_users.json'), JSON.stringify(users, null, 1))
  counts.auth_users = users.length

  writeFileSync(join(out, 'counts.json'), JSON.stringify(counts, null, 1))
  const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0)
  for (const [t, n] of nonEmpty) console.log(`  ${String(n).padStart(6)}  ${t}`)
  console.log(`Done — ${nonEmpty.length} non-empty tables.`)
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
