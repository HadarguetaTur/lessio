/**
 * Build the English demo tenant handed to Meta App Review.
 *
 * Creates "Brightpath Tutoring" from nothing: four Supabase Auth users, the org,
 * three teachers with availability, twelve parents, fifteen students, ~14 weeks of
 * lessons, four months of billing through the real engine, homework, lesson notes
 * and learning goals. The reviewer logs in as the owner and sees a populated
 * product in English.
 *
 * Distinct from scripts/seed-demo-data.ts, which tops up Hadar's own Hebrew org.
 * This one owns its organization outright, so a re-run wipes the transactional
 * tables for that org and rebuilds them — that is the intended daily reset.
 *
 * Every row lives under a fixed UUID prefixed d2000000- (the Hebrew demo uses
 * d1000000-), so the two demo environments are cleaned up independently.
 *
 * Usage:  REVIEW_DEMO_PASSWORD=... npx tsx scripts/seed-review-demo.ts
 * Env (falling back to .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, REVIEW_DEMO_PASSWORD, optional REVIEW_DEMO_OWNER_EMAIL,
 * optional REVIEW_DEMO_VARIANT (digit 1-9: builds an identical side-by-side copy
 * with its own org id, slug and emails — e.g. reviewer2@getlessio.com — kept
 * deliberately unconnected to WhatsApp so the connect flow can be demoed).
 *
 * The WhatsApp connection is NOT set here — run scripts/connect-demo-whatsapp.ts
 * with DEMO_ORG_OWNER_EMAIL pointed at the reviewer account afterwards.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import { buildStudentMonth } from '../src/lib/billing/monthly/buildStudentMonth'
import { isMissingFieldsError } from '../src/lib/billing/monthly/types'

// ── Identity ──────────────────────────────────────────────────────────────────

// The variant decides the identity constants below, so env must load first.
loadEnvLocal()

/**
 * REVIEW_DEMO_VARIANT (single digit 1-9) builds a parallel copy of the tenant —
 * its own org id, slug and auth emails — so both can live side by side. A
 * variant tenant is deliberately left without a WhatsApp connection: it exists
 * to film the connect-a-number flow from scratch. Clean it up with the same
 * REVIEW_DEMO_VARIANT passed to scripts/cleanup-review-demo.ts.
 */
const VARIANT = process.env.REVIEW_DEMO_VARIANT ?? ''
if (VARIANT && !/^[1-9]$/.test(VARIANT)) {
  fail(`REVIEW_DEMO_VARIANT must be a single digit 1-9, got "${VARIANT}"`)
}
/** sarah.klein@demo.getlessio.com → sarah.klein2@demo.getlessio.com for variant 2. */
const variantEmail = (email: string): string =>
  VARIANT ? email.replace('@', `${VARIANT}@`) : email

const DEFAULT_OWNER_EMAIL = variantEmail('reviewer@getlessio.com')
const OWNER_NAME = 'Emma Bennett'
const ORG_NAME = 'Brightpath Tutoring'
const ORG_SLUG = VARIANT ? `brightpath-tutoring-${VARIANT}` : 'brightpath-tutoring'
const TIMEZONE = 'Asia/Jerusalem'

/** The only number the Meta test phone is allowed to deliver to. */
const VERIFIED_PARENT_PHONE = '+972504343547'

const WEEKS_BACK = 12
const WEEKS_FORWARD = 2
const BILLING_MONTHS = 4
const UNPAID_RECENT_MONTHS = 1

// ── Fixed UUIDs (valid v4 shape, recognizable d2000000 prefix) ────────────────
// A variant swaps the prefix's last digit (d2000002- for variant 2), keeping
// every copy's rows distinct and independently cleanable.

const uid = (suffix: string): string => `d200000${VARIANT || '0'}-0000-4000-8000-${suffix}`

const ORG_ID = uid('000000000000')
const SHOWCASE_LESSON_ID = uid('000000000003')
const teacherId = (i: number): string => uid(`0000000001${String(i).padStart(2, '0')}`)
const parentId = (i: number): string => uid(`0000000002${String(i).padStart(2, '0')}`)
const studentId = (i: number): string => uid(`0000000003${String(i).padStart(2, '0')}`)
const goalId = (i: number): string => uid(`0000000004${String(i).padStart(2, '0')}`)
const homeworkId = (i: number): string => uid(`0000000005${String(i).padStart(2, '0')}`)
const noteId = (i: number): string => uid(`0000000006${String(i).padStart(2, '0')}`)
const planId = (i: number): string => uid(`0000000007${String(i).padStart(2, '0')}`)
/** week is already offset to be non-negative. */
const lessonId = (student: number, week: number): string =>
  uid(`1${String(student).padStart(2, '0')}${String(week).padStart(2, '0')}0000000`)

// ── Roster ────────────────────────────────────────────────────────────────────

type TeacherSeed = { email: string; name: string; subject: string; rate: number }

// Teacher emails must also change per variant: reusing the base addresses would
// re-point those auth users' profiles at the copy and orphan the original org.
const TEACHERS: TeacherSeed[] = [
  { email: 'sarah.klein@demo.getlessio.com', name: 'Sarah Klein', subject: 'Mathematics', rate: 200 },
  { email: 'david.mor@demo.getlessio.com', name: 'David Mor', subject: 'Physics', rate: 220 },
  { email: 'noa.barak@demo.getlessio.com', name: 'Noa Barak', subject: 'English', rate: 180 },
].map((t) => ({ ...t, email: variantEmail(t.email) }))

type ParentSeed = { name: string; phone: string; email: string }
type StudentSeed = { name: string; grade: string; parent: number; subject: string; level: string }

/**
 * Parent phones use the NANP 555-01xx range, which is reserved for fiction and
 * can never reach a real person. The one exception is Rachel Adams, who must
 * carry the number verified on the Meta test phone or the bot demo cannot run.
 */
const PARENTS: ParentSeed[] = [
  { name: 'Rachel Adams', phone: VERIFIED_PARENT_PHONE, email: 'rachel.adams@example.com' },
  { name: 'Michael Foster', phone: '+12025550102', email: 'michael.foster@example.com' },
  { name: 'Laura Bennett', phone: '+12025550103', email: 'laura.bennett@example.com' },
  { name: 'Daniel Cohen', phone: '+12025550104', email: 'daniel.cohen@example.com' },
  { name: 'Sarah Mitchell', phone: '+12025550105', email: 'sarah.mitchell@example.com' },
  { name: 'James Porter', phone: '+12025550106', email: 'james.porter@example.com' },
  { name: 'Anna Rivers', phone: '+12025550107', email: 'anna.rivers@example.com' },
  { name: 'Tom Sinclair', phone: '+12025550108', email: 'tom.sinclair@example.com' },
  { name: 'Helen Wright', phone: '+12025550109', email: 'helen.wright@example.com' },
  { name: 'Peter Nolan', phone: '+12025550110', email: 'peter.nolan@example.com' },
  { name: 'Karen Hughes', phone: '+12025550111', email: 'karen.hughes@example.com' },
  { name: 'Robert Ellis', phone: '+12025550112', email: 'robert.ellis@example.com' },
]

/**
 * Student order matters: index 0 is the student in the screencast, and
 * `floor(index / 5)` picks the teacher while `index % 5` picks the weekday, which
 * is what keeps the schedule free of teacher overlaps.
 */
const STUDENTS: StudentSeed[] = [
  { name: 'Daniel Adams', grade: '10th grade', parent: 0, subject: 'Mathematics', level: 'Advanced' },
  { name: 'Ethan Foster', grade: '11th grade', parent: 1, subject: 'Mathematics', level: 'Intermediate' },
  { name: 'Sophie Bennett', grade: '9th grade', parent: 2, subject: 'Mathematics', level: 'Intermediate' },
  { name: 'Noah Cohen', grade: '12th grade', parent: 3, subject: 'Mathematics', level: 'Advanced' },
  { name: 'Olivia Mitchell', grade: '8th grade', parent: 4, subject: 'Mathematics', level: 'Foundation' },
  { name: 'Emma Porter', grade: '11th grade', parent: 5, subject: 'Physics', level: 'Advanced' },
  { name: 'Jacob Rivers', grade: '9th grade', parent: 6, subject: 'Physics', level: 'Intermediate' },
  { name: 'Ava Sinclair', grade: '12th grade', parent: 7, subject: 'Physics', level: 'Advanced' },
  { name: 'Lucas Wright', grade: '10th grade', parent: 8, subject: 'Physics', level: 'Intermediate' },
  { name: 'Maya Adams', grade: '7th grade', parent: 0, subject: 'Physics', level: 'Foundation' },
  { name: 'Chloe Nolan', grade: '7th grade', parent: 9, subject: 'English', level: 'Foundation' },
  { name: 'Mason Hughes', grade: '11th grade', parent: 10, subject: 'English', level: 'Intermediate' },
  { name: 'Isabella Ellis', grade: '9th grade', parent: 11, subject: 'English', level: 'Advanced' },
  { name: 'Ryan Ellis', grade: '12th grade', parent: 11, subject: 'English', level: 'Intermediate' },
  { name: 'Liam Mitchell', grade: '10th grade', parent: 4, subject: 'English', level: 'Intermediate' },
]

/** Students on a flat monthly plan; the rest are billed per lesson. */
const SUBSCRIBED_STUDENTS = [0, 3, 6, 9, 12]
const MONTHLY_PLAN_AMOUNT = 900
const PER_LESSON_PRICE = [200, 220, 180]

// ── .env.local loader (no dotenv dependency, matching the sibling scripts) ────

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
  console.error(`✗ ${msg}`)
  process.exit(1)
}

async function expectOk(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p
  if (error) fail(`${label}: ${error.message}`)
}

/** Paginates auth.users — the project has more users than one page holds. */
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

/**
 * Creates the auth user, or resets the password on the existing one so a re-run
 * always leaves the documented credentials working.
 *
 * `email_confirm: true` is the point of this helper: these addresses are
 * fictitious and can never receive a verification mail, so the self-serve path in
 * src/lib/auth/createOrgWithOwner.ts (email_confirm: false + resend) would leave
 * an account nobody can log into.
 */
async function ensureAuthUser(
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
    console.log(`  ↻ ${email} (existing, password reset)`)
    return existing
  }

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data?.user) fail(`Failed to create auth user ${email}: ${error?.message}`)
  console.log(`  + ${email} (created)`)
  return data.user.id
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  const password = process.env.REVIEW_DEMO_PASSWORD
  if (!password || password.length < 12) {
    fail(
      'Set REVIEW_DEMO_PASSWORD (≥12 chars) in .env.local or the environment.\n' +
        '  This is the password handed to Meta in the App Review form, so it is\n' +
        '  deliberately not hardcoded in the repo.'
    )
  }
  // A variant ignores REVIEW_DEMO_OWNER_EMAIL: honoring it would upsert the
  // base reviewer's profile into the copy and pull them out of the original org.
  const ownerEmail = VARIANT
    ? DEFAULT_OWNER_EMAIL
    : (process.env.REVIEW_DEMO_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL)

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const now = DateTime.now().setZone(TIMEZONE)

  // ── 1. Auth users ───────────────────────────────────────────────────────────
  console.log('\n▸ Auth users')
  const ownerUserId = await ensureAuthUser(db, ownerEmail, password, OWNER_NAME)
  const teacherUserIds: string[] = []
  for (const t of TEACHERS) {
    teacherUserIds.push(await ensureAuthUser(db, t.email, password, t.name))
  }

  // ── 2. Organization ─────────────────────────────────────────────────────────
  // onboarding_completed: the reviewer must land on the product, not the wizard.
  // default_locale 'en': the bot answers in English. There is no UI for this column.
  // auto_send_payment_request stays off — completing a lesson would otherwise fire
  // WhatsApp sends at numbers the Meta test phone is not allowed to deliver to.
  console.log('\n▸ Organization')
  await expectOk(
    'upsert organization',
    db.from('organizations').upsert(
      {
        id: ORG_ID,
        name: ORG_NAME,
        slug: ORG_SLUG,
        timezone: TIMEZONE,
        currency: 'ILS',
        default_locale: 'en',
        billing_mode: 'monthly',
        group_pricing_mode: 'per_student',
        break_duration_minutes: 0,
        min_booking_notice_hours: 2,
        onboarding_completed: true,
        // A variant exists to have a number connected to it on camera, and the
        // reminder crons sweep every org that has one — leaving these on would
        // fire lesson/homework/payment reminders at the twelve fictional parent
        // numbers from whatever real business account gets connected. Off by
        // default; turning them on in /settings/whatsapp is itself a good shot.
        reminders_enabled: !VARIANT,
        automation_lesson_reminder_enabled: !VARIANT,
        automation_lesson_reminder_hours: 24,
        automation_cancellation_enabled: !VARIANT,
        automation_payment_request_enabled: !VARIANT,
        automation_dunning_enabled: !VARIANT,
        automation_new_leads_enabled: !VARIANT,
        ai_assistant_enabled: true,
        auto_send_payment_request: false,
        business_legal_name: 'Brightpath Tutoring Ltd.',
        business_address: '14 Rothschild Blvd, Tel Aviv',
      },
      { onConflict: 'id' }
    )
  )
  console.log(`  ✓ "${ORG_NAME}" [${ORG_ID}] — English UI, English bot`)

  await expectOk(
    'upsert cancellation policy',
    db.from('cancellation_policies').upsert(
      {
        organization_id: ORG_ID,
        notice_hours_full: 24,
        notice_hours_partial: 2,
        partial_charge_percent: 50,
      },
      { onConflict: 'organization_id' }
    )
  )

  // ── 3. Profiles ─────────────────────────────────────────────────────────────
  // preferred_locale 'en' is the lever that forces the English dashboard:
  // src/app/login/actions.ts reads it on sign-in and overwrites the locale cookie.
  console.log('\n▸ Profiles')
  await expectOk(
    'upsert owner profile',
    db.from('profiles').upsert(
      {
        id: ownerUserId,
        organization_id: ORG_ID,
        full_name: OWNER_NAME,
        role: 'owner',
        is_active: true,
        preferred_locale: 'en',
      },
      { onConflict: 'id' }
    )
  )
  for (const [i, t] of TEACHERS.entries()) {
    await expectOk(
      `upsert teacher profile ${t.name}`,
      db.from('profiles').upsert(
        {
          id: teacherUserIds[i],
          organization_id: ORG_ID,
          full_name: t.name,
          role: 'teacher',
          is_active: true,
          preferred_locale: 'en',
        },
        { onConflict: 'id' }
      )
    )
  }
  console.log(`  ✓ ${OWNER_NAME} (owner) + ${TEACHERS.length} teacher profiles`)

  // ── 4. Teachers + weekly availability ───────────────────────────────────────
  console.log('\n▸ Teachers')
  for (const [i, t] of TEACHERS.entries()) {
    await expectOk(
      `upsert teacher ${t.name}`,
      db.from('teachers').upsert(
        {
          id: teacherId(i),
          organization_id: ORG_ID,
          profile_id: teacherUserIds[i],
          hourly_rate: t.rate,
          bio: `${t.subject} teacher`,
          is_active: true,
        },
        { onConflict: 'id' }
      )
    )
    await expectOk(
      'clear availability',
      db.from('availability').delete().eq('teacher_id', teacherId(i))
    )
    // Sunday–Thursday, the Israeli school week.
    const rows = [0, 1, 2, 3, 4].map((day) => ({
      organization_id: ORG_ID,
      teacher_id: teacherId(i),
      day_of_week: day,
      start_time: '15:00',
      end_time: '20:00',
    }))
    await expectOk('insert availability', db.from('availability').insert(rows))
    console.log(`  ✓ ${t.name} — ${t.subject}, ₪${t.rate}/h, Sun–Thu 15:00–20:00`)
  }

  // ── 5. SaaS subscription — 'advanced' unlocks every feature gate ────────────
  console.log('\n▸ Platform subscription')
  const { data: plan } = await db
    .from('saas_plans')
    .select('id, name')
    .eq('name', 'advanced')
    .maybeSingle()
  if (!plan) fail("No saas_plans row named 'advanced' — cannot unlock feature gates")
  await expectOk(
    'upsert organization subscription',
    db.from('organization_subscriptions').upsert(
      {
        organization_id: ORG_ID,
        plan_id: plan.id,
        status: 'active',
        billing_interval: 'yearly',
        current_period_start: now.toUTC().toISO(),
        current_period_end: now.plus({ years: 1 }).toUTC().toISO(),
      },
      { onConflict: 'organization_id' }
    )
  )
  console.log("  ✓ plan 'advanced', active for 1 year (whatsapp_automation, ai, reports, portal)")

  // ── 6. Wipe this org's transactional tables ────────────────────────────────
  // The org is exclusively ours, so a rebuild is safe and is what makes the daily
  // reset work. Order matters: charges reference billing records and lessons.
  console.log('\n▸ Resetting previous run')
  for (const table of [
    'charges',
    'student_monthly_billing',
    'student_cancellation_events',
    'lesson_notes',
    'homework_assignments',
    'student_goals',
    'subscriptions',
    'lessons',
    // Dedup rows from a previous run block reminders for re-seeded lesson ids,
    // and old #131030 failures would linger in /settings/reminders.
    'notification_log',
  ]) {
    await expectOk(`clear ${table}`, db.from(table).delete().eq('organization_id', ORG_ID))
  }
  console.log('  ✓ lessons, billing, homework, notes, goals and notification log cleared')

  // ── 7. Parents, students, relationships ────────────────────────────────────
  console.log('\n▸ Parents & students')
  for (const [i, p] of PARENTS.entries()) {
    await expectOk(
      `upsert parent ${p.name}`,
      db.from('parents').upsert(
        {
          id: parentId(i),
          organization_id: ORG_ID,
          full_name: p.name,
          phone: p.phone,
          email: p.email,
          is_active: true,
          // Rachel resets to null — a demo run that exercises the opt-out shot
          // would otherwise silently mute her for every later run. The fictional
          // 555-01xx parents seed opted-out: the Meta test phone can never
          // deliver to them, so letting the sendSmart opt-out gate skip them
          // beats every reminder cron burning a doomed API call and landing a
          // red #131030 row in /settings/reminders.
          opted_out_at: p.phone === VERIFIED_PARENT_PHONE ? null : now.toISO(),
          // Consent evidence exists (the tutor declared it at signup), but the
          // welcome notice is deliberately reset to null on the reviewer's own
          // number so Video B shows the real thing: the one-time "who is
          // messaging you and how to stop" notice landing before the first
          // reminder. The fictional parents are opted out anyway.
          consent_source: 'attested',
          consented_at: now.toISO(),
          welcome_sent_at: p.phone === VERIFIED_PARENT_PHONE ? null : now.toISO(),
          // Reset every run: the webhook persists the script of whatever the
          // parent last wrote, so one Hebrew "היי" during a take would otherwise
          // switch every later reminder in the English screencast to Hebrew.
          preferred_locale: 'en',
        },
        { onConflict: 'id' }
      )
    )
  }
  for (const [i, s] of STUDENTS.entries()) {
    await expectOk(
      `upsert student ${s.name}`,
      db.from('students').upsert(
        {
          id: studentId(i),
          organization_id: ORG_ID,
          full_name: s.name,
          grade: s.grade,
          level: s.level,
          focused_subject: s.subject,
          teacher_id: teacherId(Math.floor(i / 5)),
          weekly_quota: 1,
          status: 'active',
        },
        { onConflict: 'id' }
      )
    )
    await expectOk(
      `upsert relationship ${s.name}`,
      db.from('relationships').upsert(
        {
          organization_id: ORG_ID,
          parent_id: parentId(s.parent),
          student_id: studentId(i),
          is_primary: true,
        },
        { onConflict: 'parent_id,student_id' }
      )
    )
  }
  console.log(
    `  ✓ ${PARENTS.length} parents, ${STUDENTS.length} students ` +
      `(Rachel Adams ${VERIFIED_PARENT_PHONE} → Daniel + Maya, so the bot shows the child picker)`
  )

  // ── 8. Monthly plans for a subset, so both billing paths are visible ───────
  for (const i of SUBSCRIBED_STUDENTS) {
    await expectOk(
      `insert plan for ${STUDENTS[i].name}`,
      db.from('subscriptions').insert({
        id: planId(i),
        organization_id: ORG_ID,
        student_id: studentId(i),
        subscription_type: 'monthly',
        monthly_amount: MONTHLY_PLAN_AMOUNT,
        start_date: now.minus({ months: 6 }).toISODate(),
        is_paused: false,
      })
    )
  }
  console.log(
    `  ✓ ${SUBSCRIBED_STUDENTS.length} students on a ₪${MONTHLY_PLAN_AMOUNT}/mo plan, ` +
      `${STUDENTS.length - SUBSCRIBED_STUDENTS.length} billed per lesson`
  )

  // ── 9. Lessons ─────────────────────────────────────────────────────────────
  // Slot layout keeps the EXCLUDE constraint no_teacher_lesson_overlap satisfied
  // by construction: teacher n owns hour 17+n, and each of their five students
  // owns a different weekday. 16:00 is left free for the showcase lesson.
  console.log('\n▸ Lessons')
  const thisSunday = now.minus({ days: now.weekday % 7 }).startOf('day')

  type LessonRow = {
    id: string
    organization_id: string
    teacher_id: string
    start_at: string
    end_at: string
    status: string
    lesson_type: string
    max_students: number
    price_per_student: number | null
    cancel_reason: string | null
  }
  const lessons: { row: LessonRow; student: number }[] = []

  for (const [i] of STUDENTS.entries()) {
    const teacher = Math.floor(i / 5)
    const hour = 17 + teacher
    const weekday = i % 5
    const subscribed = SUBSCRIBED_STUDENTS.includes(i)

    for (let w = -WEEKS_BACK; w <= WEEKS_FORWARD; w++) {
      const start = thisSunday.plus({ weeks: w, days: weekday }).set({ hour, minute: 0 })
      const past = start < now
      // Deterministic, so a re-run produces the same history.
      const cancelled = past && (i * 7 + w + WEEKS_BACK) % 13 === 0
      lessons.push({
        student: i,
        row: {
          id: lessonId(i, w + WEEKS_BACK),
          organization_id: ORG_ID,
          teacher_id: teacherId(teacher),
          start_at: start.toUTC().toISO()!,
          end_at: start.plus({ minutes: 60 }).toUTC().toISO()!,
          status: cancelled ? 'cancelled' : past ? 'completed' : 'scheduled',
          lesson_type: 'individual',
          max_students: 1,
          price_per_student: subscribed ? null : PER_LESSON_PRICE[teacher],
          cancel_reason: cancelled ? 'Cancelled by parent' : null,
        },
      })
    }
  }

  // The lesson filmed in shot 5. 16:00 so it can never collide with a weekly slot.
  const showcaseStart = now.plus({ days: 1 }).set({ hour: 16, minute: 0, second: 0, millisecond: 0 })
  lessons.push({
    student: 0,
    row: {
      id: SHOWCASE_LESSON_ID,
      organization_id: ORG_ID,
      teacher_id: teacherId(0),
      start_at: showcaseStart.toUTC().toISO()!,
      end_at: showcaseStart.plus({ minutes: 60 }).toUTC().toISO()!,
      status: 'scheduled',
      lesson_type: 'individual',
      max_students: 1,
      price_per_student: null,
      cancel_reason: null,
    },
  })

  let inserted = 0
  let skipped = 0
  const cancelledLessons: { id: string; student: number; start: string }[] = []
  for (const { row, student } of lessons) {
    const { error } = await db.from('lessons').insert(row)
    if (error) {
      skipped++
      console.warn(`  ⚠ skipped ${row.start_at} (${error.code ?? ''} ${error.message})`)
      continue
    }
    const { error: junctionError } = await db.from('lesson_students').insert({
      organization_id: ORG_ID,
      lesson_id: row.id,
      student_id: studentId(student),
      status: row.status === 'cancelled' ? 'cancelled' : 'enrolled',
    })
    if (junctionError) {
      skipped++
      console.warn(`  ⚠ junction failed for ${row.id}: ${junctionError.message}`)
      continue
    }
    inserted++
    if (row.status === 'cancelled') {
      cancelledLessons.push({ id: row.id, student, start: row.start_at })
    }
  }
  console.log(
    `  ✓ ${inserted} lessons (${skipped} skipped), ${cancelledLessons.length} cancelled\n` +
      `  ✓ showcase lesson ${showcaseStart.toFormat('cccc dd/MM')} 16:00 — ` +
      `Daniel Adams with Sarah Klein [${SHOWCASE_LESSON_ID}]`
  )

  // ── 10. Cancellation events for the recent cancellations ───────────────────
  // is_charged: true means "an admin already decided", which keeps the billing
  // record approved. A pending event would leave /billing needing review.
  let events = 0
  for (const c of cancelledLessons) {
    const start = DateTime.fromISO(c.start, { zone: TIMEZONE })
    if (start < now.minus({ months: BILLING_MONTHS - 1 }).startOf('month')) continue
    const lateNotice = events % 2 === 0
    await expectOk(
      'insert cancellation event',
      db.from('student_cancellation_events').insert({
        organization_id: ORG_ID,
        lesson_id: c.id,
        student_id: studentId(c.student),
        cancellation_date: start.minus({ hours: lateNotice ? 5 : 48 }).toUTC().toISO(),
        hours_before: lateNotice ? 5 : 48,
        is_lt_24h: lateNotice,
        is_charged: true,
        billing_month: start.toFormat('yyyy-MM'),
      })
    )
    events++
  }
  console.log(`  ✓ ${events} cancellation events (alternating late / in-policy)`)

  // ── 11. Homework, lesson notes, learning goals ─────────────────────────────
  console.log('\n▸ Pedagogy')
  const HOMEWORK = [
    { title: 'Quadratic equations — set B', body: 'Complete exercises 1–12 on page 84. Show your working for each step.', status: 'done', due: -6 },
    { title: 'Trigonometry practice', body: 'Sine and cosine rules: questions 3, 5, 7 and 9 from the worksheet.', status: 'done', due: -3 },
    { title: 'Word problems worksheet', body: 'Two rate-of-change problems. Sketch the graph before you solve.', status: 'pending', due: 2 },
    { title: "Newton's laws — summary", body: 'Write a one-page summary of the three laws with one example each.', status: 'overdue', due: -2 },
    { title: 'Kinematics problem set', body: 'Problems 4 to 10. Draw a motion diagram for each before calculating.', status: 'pending', due: 3 },
    { title: 'Reading comprehension — Unit 7', body: 'Read the passage and answer the five questions in full sentences.', status: 'done', due: -5 },
    { title: 'Essay draft: persuasive writing', body: 'First draft, 250 words, on a topic of your choice. Focus on structure.', status: 'pending', due: 4 },
    { title: 'Vocabulary list 12', body: 'Learn the 20 words and write a sentence using each one.', status: 'done', due: -8 },
    { title: 'Algebra revision', body: 'Revision sheet ahead of next week — factorising and expanding.', status: 'pending', due: 5 },
    { title: 'Lab report — pendulum', body: 'Write up the experiment: method, results table, and conclusion.', status: 'overdue', due: -1 },
  ]
  for (const [i, hw] of HOMEWORK.entries()) {
    const student = i % STUDENTS.length
    await expectOk(
      `insert homework "${hw.title}"`,
      db.from('homework_assignments').insert({
        id: homeworkId(i),
        organization_id: ORG_ID,
        teacher_id: teacherId(Math.floor(student / 5)),
        student_id: studentId(student),
        title: hw.title,
        body: hw.body,
        due_date: now.plus({ days: hw.due }).toISODate(),
        status: hw.status,
        sent_at: now.plus({ days: hw.due }).minus({ days: 5 }).toUTC().toISO(),
        completed_at: hw.status === 'done' ? now.plus({ days: hw.due }).minus({ days: 1 }).toUTC().toISO() : null,
      })
    )
  }
  // Two graded submissions so the homework module shows the full loop.
  for (const [n, i] of [0, 5].entries()) {
    await expectOk(
      'insert homework submission',
      db.from('homework_submissions').upsert(
        {
          organization_id: ORG_ID,
          assignment_id: homeworkId(i),
          student_id: studentId(i % STUDENTS.length),
          note: n === 0 ? 'Finished all twelve, question 9 was tricky.' : 'Done — I found the last question hard.',
          score: n === 0 ? 92 : 78,
          feedback:
            n === 0
              ? 'Excellent work. Watch the sign when you factorise in Q9.'
              : 'Good effort. Re-read the passage before answering next time.',
          graded_at: now.minus({ days: 2 }).toUTC().toISO(),
          graded_by: ownerUserId,
        },
        { onConflict: 'assignment_id,student_id' }
      )
    )
  }
  console.log(`  ✓ ${HOMEWORK.length} homework assignments, 2 graded submissions`)

  const NOTES = [
    'Covered factorising quadratics. Confident with the method, still rushing the sign checks.',
    'Worked through past-paper section B. Timing improved noticeably this week.',
    'Revisited Newton\'s second law with worked examples. Much clearer by the end.',
    'Reading fluency is strong; focus next on paragraph structure in writing.',
    'Went over last week\'s test. Two careless errors, no conceptual gaps.',
    'Introduced the sine rule. Needs one more session before moving on.',
  ]
  const { data: recentCompleted } = await db
    .from('lessons')
    .select('id, teacher_id')
    .eq('organization_id', ORG_ID)
    .eq('status', 'completed')
    .order('start_at', { ascending: false })
    .limit(NOTES.length)
  for (const [i, lesson] of (recentCompleted ?? []).entries()) {
    await expectOk(
      'insert lesson note',
      db.from('lesson_notes').insert({
        id: noteId(i),
        organization_id: ORG_ID,
        lesson_id: lesson.id,
        teacher_id: lesson.teacher_id,
        body: NOTES[i],
      })
    )
  }
  console.log(`  ✓ ${recentCompleted?.length ?? 0} lesson notes`)

  const GOALS = [
    { student: 0, subject: 'Mathematics', description: 'Reach a consistent 85+ on end-of-unit tests', status: 'active', months: 3 },
    { student: 0, subject: 'Mathematics', description: 'Master factorising quadratic expressions', status: 'achieved', months: -1 },
    { student: 3, subject: 'Mathematics', description: 'Complete the full past paper within the time limit', status: 'active', months: 2 },
    { student: 5, subject: 'Physics', description: 'Be able to derive the kinematic equations unaided', status: 'active', months: 4 },
    { student: 10, subject: 'English', description: 'Write a structured five-paragraph essay independently', status: 'active', months: 3 },
    { student: 12, subject: 'English', description: 'Build an active vocabulary of 500 new words', status: 'achieved', months: -2 },
  ]
  for (const [i, g] of GOALS.entries()) {
    await expectOk(
      'insert student goal',
      db.from('student_goals').insert({
        id: goalId(i),
        organization_id: ORG_ID,
        student_id: studentId(g.student),
        subject: g.subject,
        description: g.description,
        target_date: now.plus({ months: g.months }).toISODate(),
        status: g.status,
        created_by: ownerUserId,
      })
    )
  }
  console.log(`  ✓ ${GOALS.length} learning goals`)

  // ── 12. Billing through the real engine ────────────────────────────────────
  console.log('\n▸ Billing')
  const months: string[] = []
  for (let i = BILLING_MONTHS - 1; i >= 0; i--) {
    months.push(now.minus({ months: i }).toFormat('yyyy-MM'))
  }

  for (const [monthIndex, month] of months.entries()) {
    const fullyPaidMonth = monthIndex < months.length - UNPAID_RECENT_MONTHS
    // The current month is partially collected: two students in three have
    // paid, one is still open. A dashboard where nothing this month is paid
    // reads as a business nobody pays, and an all-paid month hides the
    // reminder / mark-as-paid flow the screencast wants to show.
    const isCurrentMonth = monthIndex === months.length - 1
    let monthTotal = 0
    let billed = 0
    let paidCount = 0

    for (const [i] of STUDENTS.entries()) {
      const shouldBePaid = fullyPaidMonth || (isCurrentMonth && i % 3 !== 2)
      const result = await buildStudentMonth(ORG_ID, studentId(i), month, TIMEZONE)
      if (result === 'skipped') continue
      if (isMissingFieldsError(result)) {
        console.warn(`  ⚠ ${month} ${STUDENTS[i].name}: ${JSON.stringify(result.MISSING_FIELDS)}`)
        continue
      }
      monthTotal += result.totalAmount
      billed++

      if (!shouldBePaid) continue

      const { data: billing } = await db
        .from('student_monthly_billing')
        .select('id, is_paid')
        .eq('organization_id', ORG_ID)
        .eq('student_id', studentId(i))
        .eq('billing_month', month)
        .maybeSingle()
      if (!billing || billing.is_paid) continue

      // Past months settle on the 5th of the following month. The current
      // month's payments are spread over the days already elapsed, so the
      // "collected this month" KPI and any payment timeline look lived-in.
      const paidAt = isCurrentMonth
        ? now
            .startOf('month')
            .plus({ days: Math.min(1 + (i * 4) % Math.max(1, now.day - 1), now.day - 1), hours: 9 + (i % 6) })
            .toUTC()
            .toISO()
        : DateTime.fromFormat(month, 'yyyy-MM', { zone: TIMEZONE })
            .plus({ months: 1 })
            .set({ day: 5, hour: 10 })
            .toUTC()
            .toISO()
      paidCount++
      await expectOk(
        'mark billing paid',
        db
          .from('student_monthly_billing')
          .update({ is_paid: true, updated_at: new Date().toISOString() })
          .eq('id', billing.id)
      )
      await expectOk(
        'mark charges paid',
        db
          .from('charges')
          .update({ status: 'paid', paid_at: paidAt, updated_at: new Date().toISOString() })
          .eq('organization_id', ORG_ID)
          .eq('billing_record_id', billing.id)
      )
    }
    console.log(
      `  ${month}: ₪${monthTotal.toFixed(2)} across ${billed} students` +
        (fullyPaidMonth ? ' — paid' : isCurrentMonth ? ` — ${paidCount} paid, ${billed - paidCount} OPEN` : ' — OPEN')
    )
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(
    '\n' +
      '─'.repeat(70) +
      '\nReviewer credentials\n' +
      `  URL:      https://www.getlessio.com/login\n` +
      `  Email:    ${ownerEmail}\n` +
      `  Password: (REVIEW_DEMO_PASSWORD)\n` +
      '\nFor the screencast\n' +
      `  • WhatsApp parent:  Rachel Adams ${VERIFIED_PARENT_PHONE}\n` +
      `  • Showcase lesson:  ${showcaseStart.toFormat('cccc dd/MM')} 16:00 — /lessons/${SHOWCASE_LESSON_ID}\n` +
      `  • Open balance:     ${months.slice(-UNPAID_RECENT_MONTHS).join(', ')}\n` +
      (VARIANT
        ? '\nVariant tenant — WhatsApp left unconnected on purpose.\n' +
          '  Film the connect-a-number flow from this account; do NOT run\n' +
          '  connect-demo-whatsapp.ts against it (the test number belongs to the\n' +
          '  base tenant, and a number can only live on one org).\n' +
          '  Reminder automations are OFF so that connecting a real number cannot\n' +
          '  broadcast to the fictional parent numbers. Enable them on camera in\n' +
          '  /settings/whatsapp if the shot needs it.\n' +
          `\nCleanup: REVIEW_DEMO_VARIANT=${VARIANT} npx tsx scripts/cleanup-review-demo.ts --yes\n`
        : '\nNext steps\n' +
          '  1. DEMO_ORG_OWNER_EMAIL=' + ownerEmail + ' npx tsx scripts/connect-demo-whatsapp.ts\n' +
          '  2. npx tsx scripts/diagnose-demo-whatsapp.ts\n' +
          '\nCleanup after approval: npx tsx scripts/cleanup-review-demo.ts\n') +
      '─'.repeat(70)
  )
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
