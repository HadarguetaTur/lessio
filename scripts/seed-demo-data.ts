/**
 * OBSOLETE as of 2026-08-17 — kept only for reference.
 *
 * This script topped up the Hebrew demo data in the hadart20@gmail.com
 * organization. That organization and its owner account were deleted when the
 * App Review demo moved to the English tenant, so this now fails with
 * "No auth user found". Use scripts/seed-review-demo.ts instead.
 *
 * ---
 *
 * Seed demo data for the Meta App Review screencast into the demo organization.
 *
 * Target org = the organization owned by DEMO_ORG_OWNER_EMAIL (default
 * hadart20@gmail.com) in the connected Supabase project. ADDITIVE and
 * idempotent: every demo row uses a fixed, recognizable UUID (d1000000-…)
 * so re-runs replace only our own rows and post-Review cleanup is trivial.
 * No broad deletes.
 *
 * What it creates:
 *  - organization_subscriptions → status 'trial' +30d (unlocks whatsapp_automation
 *    + full_reports feature gates; orgs with no subscription row are already unlocked)
 *  - teacher hourly_rate (billing engine requires it)
 *  - parent "יעל לוי" (+972504343547, the Meta-verified test recipient) — primary
 *    parent of student "דניאל לוי"
 *  - ~8 months of weekly lesson history (completed/cancelled mix) → /reports alive
 *  - tomorrow's lesson at 17:00 (the one the bot reschedules in the video)
 *  - monthly billing via the REAL engine (buildStudentMonth → charges ledger),
 *    all months paid except the last two → open debt + Send-payment-request button
 *
 * Usage: npx tsx scripts/seed-demo-data.ts
 * Env (falling back to .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, optional DEMO_ORG_OWNER_EMAIL.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import { buildStudentMonth } from '../src/lib/billing/monthly/buildStudentMonth'
import { isMissingFieldsError } from '../src/lib/billing/monthly/types'

const DEFAULT_OWNER_EMAIL = 'hadart20@gmail.com'
const PARENT_PHONE = '+972504343547' // Meta-verified recipient, normalized E.164
const HISTORY_WEEKS = 34 // ≈ 8 months
const BILLING_MONTHS = 9
const UNPAID_RECENT_MONTHS = 2
const HOURLY_RATE = 200

// Fixed demo UUIDs (valid v4 shape, recognizable d1000000 prefix)
const PARENT_ID = 'd1000000-0000-4000-8000-000000000001'
const STUDENT_ID = 'd1000000-0000-4000-8000-000000000002'
const TOMORROW_LESSON_ID = 'd1000000-0000-4000-8000-000000000003'
const historyLessonId = (week: number): string =>
  `d1000000-0000-4000-8000-1000000000${String(week).padStart(2, '0')}`

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

async function resolveOrg(
  db: SupabaseClient,
  ownerEmail: string
): Promise<{ orgId: string; orgName: string; ownerProfileId: string; timezone: string }> {
  const { data: usersPage, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) fail(`Failed to list auth users: ${error.message}`)
  const user = usersPage!.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase())
  if (!user) fail(`No auth user found with email ${ownerEmail}`)

  const { data: profile } = await db
    .from('profiles')
    .select('id, organization_id')
    .eq('id', user!.id)
    .maybeSingle()
  if (!profile?.organization_id) fail(`No profile/organization for ${ownerEmail}`)

  const { data: org } = await db
    .from('organizations')
    .select('id, name, timezone')
    .eq('id', profile.organization_id)
    .single()
  if (!org) fail(`Organization ${profile.organization_id} not found`)

  return {
    orgId: org.id as string,
    orgName: (org.name as string | null) ?? '(unnamed)',
    ownerProfileId: profile.id as string,
    timezone: (org.timezone as string | null) ?? 'Asia/Jerusalem',
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  const ownerEmail = process.env.DEMO_ORG_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { orgId, orgName, ownerProfileId, timezone } = await resolveOrg(db, ownerEmail)
  console.log(`✓ Demo org: "${orgName}" [${orgId}], timezone ${timezone}`)

  // 1. Unlock feature gates: subscription → active trial (+30d).
  //    Orgs with NO subscription row are grandfathered to full access — leave those alone.
  const { data: sub } = await db
    .from('organization_subscriptions')
    .select('id, status, trial_ends_at')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (sub) {
    const trialEnds = DateTime.utc().plus({ days: 30 }).toISO()
    const { error } = await db
      .from('organization_subscriptions')
      .update({ status: 'trial', trial_ends_at: trialEnds })
      .eq('id', sub.id)
    if (error) fail(`Failed to update subscription: ${error.message}`)
    console.log(`✓ Subscription set to trial until ${trialEnds} (was ${sub.status})`)
  } else {
    console.log('✓ No subscription row — org already has full feature access')
  }

  // 2. Teacher with hourly_rate (billing engine returns MISSING_FIELDS without it).
  let { data: teacher } = await db
    .from('teachers')
    .select('id, hourly_rate, profile_id')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!teacher) {
    // teachers.profile_id is NOT NULL UNIQUE — reuse the owner's profile (same as
    // onboarding's createOwnerTeacher).
    const { data: created, error } = await db
      .from('teachers')
      .insert({ organization_id: orgId, profile_id: ownerProfileId, is_active: true, hourly_rate: HOURLY_RATE })
      .select('id, hourly_rate, profile_id')
      .single()
    if (error) fail(`Failed to create teacher: ${error.message}`)
    teacher = created
    console.log(`✓ Teacher created from owner profile [${teacher!.id}]`)
  } else if (teacher.hourly_rate == null) {
    const { error } = await db
      .from('teachers')
      .update({ hourly_rate: HOURLY_RATE })
      .eq('id', teacher.id)
    if (error) fail(`Failed to set hourly_rate: ${error.message}`)
    console.log(`✓ Teacher [${teacher.id}] hourly_rate set to ${HOURLY_RATE}`)
  } else {
    console.log(`✓ Teacher [${teacher.id}] already has hourly_rate ${teacher.hourly_rate}`)
  }
  const teacherId = teacher!.id as string

  // 3. Parent (the verified test recipient) + student + primary relationship.
  //    parents has UNIQUE(organization_id, phone) — if the phone already exists on a
  //    different row, reuse that row instead of violating the constraint.
  const { data: existingParent } = await db
    .from('parents')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone', PARENT_PHONE)
    .maybeSingle()
  let parentId = PARENT_ID
  if (existingParent && existingParent.id !== PARENT_ID) {
    parentId = existingParent.id as string
    await db
      .from('parents')
      .update({ full_name: 'יעל לוי', is_active: true })
      .eq('id', parentId)
    console.log(`✓ Reusing existing parent row [${parentId}] for ${PARENT_PHONE}`)
  } else {
    const { error } = await db.from('parents').upsert(
      {
        id: PARENT_ID,
        organization_id: orgId,
        full_name: 'יעל לוי',
        phone: PARENT_PHONE,
        is_active: true,
      },
      { onConflict: 'id' }
    )
    if (error) fail(`Failed to upsert parent: ${error.message}`)
    console.log(`✓ Parent "יעל לוי" ${PARENT_PHONE} [${PARENT_ID}]`)
  }

  {
    const { error } = await db.from('students').upsert(
      { id: STUDENT_ID, organization_id: orgId, full_name: 'דניאל לוי', grade: 'ט', is_active: true },
      { onConflict: 'id' }
    )
    if (error) fail(`Failed to upsert student: ${error.message}`)
    console.log(`✓ Student "דניאל לוי" [${STUDENT_ID}]`)
  }

  {
    const { error } = await db.from('relationships').upsert(
      { organization_id: orgId, parent_id: parentId, student_id: STUDENT_ID, is_primary: true },
      { onConflict: 'parent_id,student_id' }
    )
    if (error) fail(`Failed to upsert relationship: ${error.message}`)
    console.log('✓ Primary relationship parent↔student')
  }

  // 4. Replace our fixed-UUID demo lessons (junction rows cascade on delete).
  const allDemoLessonIds = [
    TOMORROW_LESSON_ID,
    ...Array.from({ length: HISTORY_WEEKS }, (_, i) => historyLessonId(i)),
  ]
  // charges.lesson_id is a plain FK with no ON DELETE rule, so a single leftover
  // charge (e.g. the cancellation charge the bot writes during a demo run) aborts
  // the whole batched DELETE — every lesson then fails re-insert as a duplicate and
  // the "tomorrow" lesson silently keeps yesterday's date. Clear our own charges
  // first; step 5 regenerates them through the real billing engine.
  const { error: chargeDelErr } = await db
    .from('charges')
    .delete()
    .eq('organization_id', orgId)
    .in('lesson_id', allDemoLessonIds)
  if (chargeDelErr) fail(`Failed to clear demo lesson charges: ${chargeDelErr.message}`)

  const { error: lessonDelErr } = await db.from('lessons').delete().in('id', allDemoLessonIds)
  if (lessonDelErr) fail(`Failed to clear demo lessons: ${lessonDelErr.message}`)

  const now = DateTime.now().setZone(timezone)
  // History anchor: a Monday safely in the past (≥8 days ago) so it can never
  // collide with tomorrow's lesson even when tomorrow is a Monday.
  let anchor = now.minus({ days: 8 })
  anchor = anchor.minus({ days: (anchor.weekday + 6) % 7 }) // back to Monday
  anchor = anchor.set({ hour: 17, minute: 0, second: 0, millisecond: 0 })

  type LessonInsert = {
    id: string
    organization_id: string
    teacher_id: string
    start_at: string
    end_at: string
    status: string
    lesson_type: string
    max_students: number
    cancel_reason: string | null
  }
  const lessonRows: LessonInsert[] = []
  for (let week = 0; week < HISTORY_WEEKS; week++) {
    const start = anchor.minus({ weeks: week })
    const cancelled = week % 7 === 3
    lessonRows.push({
      id: historyLessonId(week),
      organization_id: orgId,
      teacher_id: teacherId,
      start_at: start.toUTC().toISO()!,
      end_at: start.plus({ minutes: 60 }).toUTC().toISO()!,
      status: cancelled ? 'cancelled' : 'completed',
      lesson_type: 'individual',
      max_students: 1,
      cancel_reason: cancelled ? 'ביטול מראש' : null,
    })
  }
  const tomorrowStart = now
    .plus({ days: 1 })
    .set({ hour: 17, minute: 0, second: 0, millisecond: 0 })
  lessonRows.push({
    id: TOMORROW_LESSON_ID,
    organization_id: orgId,
    teacher_id: teacherId,
    start_at: tomorrowStart.toUTC().toISO()!,
    end_at: tomorrowStart.plus({ minutes: 60 }).toUTC().toISO()!,
    status: 'scheduled',
    lesson_type: 'individual',
    max_students: 1,
    cancel_reason: null,
  })

  // Insert one-by-one so a single overlap (23P01) with pre-existing real lessons
  // skips that week instead of failing the whole batch.
  let inserted = 0
  let skipped = 0
  for (const row of lessonRows) {
    const { error } = await db.from('lessons').insert(row)
    if (error) {
      skipped++
      console.warn(`⚠  Skipped lesson ${row.start_at} (${error.code ?? ''} ${error.message})`)
      continue
    }
    const { error: jErr } = await db.from('lesson_students').insert({
      organization_id: orgId,
      lesson_id: row.id,
      student_id: STUDENT_ID,
      status: 'enrolled',
    })
    if (jErr) {
      skipped++
      console.warn(`⚠  Junction failed for lesson ${row.id}: ${jErr.message}`)
      continue
    }
    inserted++
  }
  console.log(`✓ Lessons: ${inserted} inserted, ${skipped} skipped (incl. tomorrow 17:00)`)

  // 5. Billing through the real engine, then back-date payments for all months
  //    except the two most recent (open debt for the video).
  const months: string[] = []
  for (let i = BILLING_MONTHS - 1; i >= 0; i--) {
    months.push(now.minus({ months: i }).toFormat('yyyy-MM'))
  }

  for (const month of months) {
    const result = await buildStudentMonth(orgId, STUDENT_ID, month, timezone)
    if (result === 'skipped') {
      console.log(`  ${month}: skipped (no billable data)`)
      continue
    }
    if (isMissingFieldsError(result)) {
      console.warn(`  ${month}: MISSING_FIELDS ${JSON.stringify(result.MISSING_FIELDS)}`)
      continue
    }
    const shouldBePaid = months.indexOf(month) < months.length - UNPAID_RECENT_MONTHS
    if (shouldBePaid) {
      const { data: billing } = await db
        .from('student_monthly_billing')
        .select('id, is_paid')
        .eq('organization_id', orgId)
        .eq('student_id', STUDENT_ID)
        .eq('billing_month', month)
        .maybeSingle()
      if (billing && !billing.is_paid) {
        await db
          .from('student_monthly_billing')
          .update({ is_paid: true, updated_at: new Date().toISOString() })
          .eq('id', billing.id)
        const paidAt = DateTime.fromFormat(month, 'yyyy-MM', { zone: timezone })
          .plus({ months: 1 })
          .set({ day: 5, hour: 10 })
          .toUTC()
          .toISO()
        await db
          .from('charges')
          .update({ status: 'paid', paid_at: paidAt, updated_at: new Date().toISOString() })
          .eq('organization_id', orgId)
          .eq('billing_record_id', billing.id)
      }
    }
    console.log(
      `  ${month}: ₪${result.totalAmount} (${result.lessonsCount} lessons)` +
        `${shouldBePaid ? ' — paid' : ' — OPEN'}${result.isApproved ? '' : ' [not approved!]'}`
    )
  }

  // 6. Org flag so the payment-request send path doesn't silently no-op.
  {
    const { error } = await db
      .from('organizations')
      .update({ auto_send_payment_request: true })
      .eq('id', orgId)
    if (error) fail(`Failed to set auto_send_payment_request: ${error.message}`)
    console.log('✓ auto_send_payment_request = true')
  }

  console.log(
    '\nDone. For the video:\n' +
      `  • Parent/"student" phone: ${PARENT_PHONE} (must be verified on the Meta test number)\n` +
      `  • Tomorrow's lesson: ${tomorrowStart.toFormat('cccc dd/MM')} 17:00 (reschedule target 18:00)\n` +
      `  • Open debt months: ${months.slice(-UNPAID_RECENT_MONTHS).join(', ')} → /billing/${STUDENT_ID}\n` +
      '  • Cleanup after Review approval: delete rows with UUID prefix d1000000-…'
  )
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
