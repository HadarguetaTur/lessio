/**
 * Remove the demo org's BUSINESS data only. Never deletes the organizations
 * row, never touches the whatsapp_*, wa_*, payment, receipt, google or ai columns, keeps
 * the owner, the SaaS subscription, the cancellation policy, message
 * templates and Meta template statuses.
 *
 * Deletes: teachers/admins (profiles + auth users on demo.getlessio.com),
 * parents, students, groups, lessons, series, billing, charges, homework,
 * notes, goals, exams, availability, day-offs, synthetic WhatsApp rows
 * (wa_message_id / message_id LIKE 'demo-%'), leads, sessions, logs.
 *
 * Usage:
 *   CENTER_DEMO_ALLOW_REMOTE=1 npx tsx scripts/center-demo/wipe.ts \
 *     --org-id d3000000-0000-4000-8000-000000000000 --yes
 */

import { getClient, assertOrg, assertWaUnchanged, fetchAll, fail, ORG_ID, OWNER_EMAIL, STAFF_EMAIL_DOMAIN } from './shared'

/** Child-first where known; the loop below retries anything an FK blocks. */
const TABLES = [
  'lesson_students', 'homework_submissions', 'homework_attachments',
  'charge_payments', 'charge_payment_references', 'charge_audit_log', 'payment_requests', 'charges',
  'student_monthly_billing', 'student_cancellation_events', 'lesson_notes', 'homework_assignments',
  'homework_templates', 'student_goals', 'student_exams', 'student_quota_overrides', 'exam_report_sessions',
  'subscriptions', 'lessons', 'lesson_series', 'slot_locks', 'availability', 'availability_overrides',
  'availability_tail_prompts', 'day_off_requests', 'notification_log', 'in_app_notifications',
  'portal_messages', 'portal_otps', 'cancellation_sessions', 'support_sessions', 'copilot_sessions', 'leads',
  'broadcast_recipients', 'broadcast_campaigns', 'student_group_invites', 'broadcast_list_members',
  'broadcast_lists', 'whatsapp_takeovers', 'whatsapp_sender_preference', 'conversation_log', 'ai_usage_log',
  'import_batches', 'relationships', 'student_groups', 'students', 'parents', 'teachers',
]

async function count(db: ReturnType<typeof getClient>, table: string): Promise<number> {
  const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq('organization_id', ORG_ID)
  if (error) fail(`count ${table}: ${error.message}`)
  return n ?? 0
}

async function main(): Promise<void> {
  const db = getClient()
  if (!process.argv.includes('--yes')) fail('Pass --yes to confirm wiping the demo org business data')

  const { name, wa: before } = await assertOrg(db)
  console.log(`\nWiping business data of "${name}" [${ORG_ID}] — the organization row stays.\n`)

  // ── Staff (everyone but the owner) ─────────────────────────────────────────
  const profiles = await fetchAll<{ id: string; role: string; full_name: string }>(
    db, 'profiles', 'id, role, full_name', (q) => q.eq('organization_id', ORG_ID).neq('role', 'owner')
  )
  const { data: usersPage, error: usersErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersErr) fail(`listUsers: ${usersErr.message}`)
  const emailById = new Map(usersPage.users.map((u) => [u.id, u.email ?? '']))

  // ── Business tables, multi-pass so FK order never matters ──────────────────
  let pending = [...TABLES]
  for (let pass = 1; pass <= 12 && pending.length > 0; pass++) {
    const next: string[] = []
    for (const table of pending) {
      const { error } = await db.from(table).delete().eq('organization_id', ORG_ID)
      if (error) {
        if (pass === 12) fail(`${table}: ${error.message}`)
        next.push(table)
      } else {
        console.log(`  ✓ ${table}`)
      }
    }
    pending = next
    if (pending.length > 0) console.log(`  … pass ${pass} done, retrying ${pending.length} table(s)`)
  }

  // Synthetic WhatsApp rows only — real inbound traffic (if any) is kept.
  await db.from('whatsapp_messages').delete().eq('organization_id', ORG_ID).like('wa_message_id', 'demo-%')
  await db.from('whatsapp_processed_messages').delete().eq('organization_id', ORG_ID).like('message_id', 'demo-%')
  console.log('  ✓ whatsapp_messages / whatsapp_processed_messages (demo-% only)')

  // Staff profiles + their auth users (teacher rows are already gone).
  for (const p of profiles) {
    const email = emailById.get(p.id) ?? ''
    const { error } = await db.from('profiles').delete().eq('id', p.id).eq('organization_id', ORG_ID)
    if (error) fail(`profile ${p.full_name}: ${error.message}`)
    if (email && email !== OWNER_EMAIL && email.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) {
      const { error: authErr } = await db.auth.admin.deleteUser(p.id)
      if (authErr) console.warn(`  ⚠ auth ${email}: ${authErr.message}`)
    } else if (email) {
      console.warn(`  ⚠ kept auth user ${email} (not a demo address)`)
    }
  }
  console.log(`  ✓ ${profiles.length} staff profiles + auth users`)

  // ── Verify ─────────────────────────────────────────────────────────────────
  const { wa: after } = await assertOrg(db)
  assertWaUnchanged(before, after)
  const leftovers: string[] = []
  for (const table of TABLES) {
    const n = await count(db, table)
    if (n > 0) leftovers.push(`${table}=${n}`)
  }
  if (leftovers.length > 0) fail(`Rows left behind: ${leftovers.join(', ')}`)
  console.log('\n✓ Business tables empty, organization row and integration columns unchanged.')
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
