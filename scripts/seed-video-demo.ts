/**
 * Build the Hebrew demo tenant used to film the marketing videos.
 *
 * Creates "סטודיו מיכל למוזיקה" from nothing: the owner, three teachers with
 * availability, fourteen parents, eighteen students, ~14 weeks of lessons, four
 * months of billing through the real engine, homework, lesson notes and learning
 * goals. Every screen in the five video scripts has believable Hebrew data
 * behind it.
 *
 * Sibling scripts:
 *   scripts/seed-review-demo.ts — the English tenant handed to Meta App Review
 *   scripts/seed-demo-data.ts   — tops up Hadar's own org
 *
 * Every row lives under a fixed UUID prefixed d3000000- (English review demo:
 * d2000000-, Hebrew demo: d1000000-), so the three environments clean up
 * independently.
 *
 * SAFETY: this script refuses to run against a non-local Supabase unless
 * VIDEO_DEMO_ALLOW_REMOTE=1 is set. It is meant for the local stack, and a
 * misdirected run would write eighteen fictional students into production.
 *
 * Usage:
 *   npx supabase start && npx supabase db reset
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service role> \
 *   VIDEO_DEMO_PASSWORD=lessio-video-demo \
 *   npx tsx scripts/seed-video-demo.ts
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import { buildStudentMonth } from '../src/lib/billing/monthly/buildStudentMonth'
import { isMissingFieldsError } from '../src/lib/billing/monthly/types'

loadEnvLocal()

// ── Identity ──────────────────────────────────────────────────────────────────

const OWNER_EMAIL = 'video-owner@demo.getlessio.com'
const OWNER_NAME = 'רונית כהן'
const ORG_NAME = 'סטודיו מיכל למוזיקה'
const ORG_SLUG = 'studio-michal-video-demo'
const TIMEZONE = 'Asia/Jerusalem'

const WEEKS_BACK = 12
const WEEKS_FORWARD = 3
const BILLING_MONTHS = 4

// ── Fixed UUIDs (valid v4 shape, recognizable d3000000 prefix) ────────────────

const uid = (suffix: string): string => `d3000000-0000-4000-8000-${suffix}`

const ORG_ID = uid('000000000000')
const SHOWCASE_LESSON_ID = uid('000000000003')
const teacherId = (i: number): string => uid(`0000000001${String(i).padStart(2, '0')}`)
const parentId = (i: number): string => uid(`0000000002${String(i).padStart(2, '0')}`)
const studentId = (i: number): string => uid(`0000000003${String(i).padStart(2, '0')}`)
const goalId = (i: number): string => uid(`0000000004${String(i).padStart(2, '0')}`)
const homeworkId = (i: number): string => uid(`0000000005${String(i).padStart(2, '0')}`)
const noteId = (i: number): string => uid(`0000000006${String(i).padStart(2, '0')}`)
const planId = (i: number): string => uid(`0000000007${String(i).padStart(2, '0')}`)
const lessonId = (student: number, week: number): string =>
  uid(`1${String(student).padStart(2, '0')}${String(week).padStart(2, '0')}0000000`)

// ── Roster ────────────────────────────────────────────────────────────────────

type TeacherSeed = { email: string; name: string; subject: string; rate: number }

/**
 * Teacher 0 is מיכל — the name that appears in the WhatsApp mockups under
 * video-assets, so the chat and the dashboard agree.
 */
const TEACHERS: TeacherSeed[] = [
  { email: 'michal@demo.getlessio.com', name: 'מיכל אברמוב', subject: 'פסנתר', rate: 240 },
  { email: 'yonatan@demo.getlessio.com', name: 'יונתן שגב', subject: 'גיטרה', rate: 200 },
  { email: 'dana@demo.getlessio.com', name: 'דנה אלמוג', subject: 'כינור', rate: 220 },
]

type ParentSeed = { name: string; phone: string; email: string }
type StudentSeed = { name: string; grade: string; parent: number; subject: string; level: string }

/**
 * Phone numbers are deliberately unallocated (05X-000-01NN). Nothing here ever
 * sends — the org has no WhatsApp connection and every parent seeds opted out —
 * but these numbers also appear on screen in the screenshots, so they must not
 * belong to a real person.
 */
const PARENTS: ParentSeed[] = [
  { name: 'יעל לוי', phone: '+972500000101', email: 'yael.levi@example.com' },
  { name: 'אבי מזרחי', phone: '+972500000102', email: 'avi.mizrahi@example.com' },
  { name: 'שירה פרידמן', phone: '+972500000103', email: 'shira.friedman@example.com' },
  { name: 'תומר גולן', phone: '+972500000104', email: 'tomer.golan@example.com' },
  { name: 'נטלי ברקוביץ', phone: '+972500000105', email: 'natali.b@example.com' },
  { name: 'עומר שרון', phone: '+972500000106', email: 'omer.sharon@example.com' },
  { name: 'הילה נחום', phone: '+972500000107', email: 'hila.nahum@example.com' },
  { name: 'דניאל אשכנזי', phone: '+972500000108', email: 'daniel.a@example.com' },
  { name: 'מאיה רוזן', phone: '+972500000109', email: 'maya.rozen@example.com' },
  { name: 'אלון כרמי', phone: '+972500000110', email: 'alon.carmi@example.com' },
  { name: 'רותם ביטון', phone: '+972500000111', email: 'rotem.biton@example.com' },
  { name: 'ליאור דגן', phone: '+972500000112', email: 'lior.dagan@example.com' },
  { name: 'סיון אלבז', phone: '+972500000113', email: 'sivan.elbaz@example.com' },
  { name: 'גיא הרשקוביץ', phone: '+972500000114', email: 'guy.h@example.com' },
]

/**
 * Student order matters: index 0 is נועה לוי, the student cancelled in the
 * video-1 WhatsApp mockup. `floor(index / 6)` picks the teacher and `index % 6`
 * the weekday, which is what keeps the schedule free of teacher overlaps.
 */
const STUDENTS: StudentSeed[] = [
  { name: 'נועה לוי', grade: 'כיתה ז', parent: 0, subject: 'פסנתר', level: 'מתקדם' },
  { name: 'איתי מזרחי', grade: 'כיתה ה', parent: 1, subject: 'פסנתר', level: 'מתחילים' },
  { name: 'רוני פרידמן', grade: 'כיתה ט', parent: 2, subject: 'פסנתר', level: 'מתקדם' },
  { name: 'עדי גולן', grade: 'כיתה ו', parent: 3, subject: 'פסנתר', level: 'ביניים' },
  { name: 'יהלי ברקוביץ', grade: 'כיתה ד', parent: 4, subject: 'פסנתר', level: 'מתחילים' },
  { name: 'שקד שרון', grade: 'כיתה ח', parent: 5, subject: 'פסנתר', level: 'ביניים' },
  { name: 'אורי נחום', grade: 'כיתה י', parent: 6, subject: 'גיטרה', level: 'מתקדם' },
  { name: 'טל אשכנזי', grade: 'כיתה ז', parent: 7, subject: 'גיטרה', level: 'ביניים' },
  { name: 'ליבי רוזן', grade: 'כיתה ה', parent: 8, subject: 'גיטרה', level: 'מתחילים' },
  { name: 'אורין כרמי', grade: 'כיתה יא', parent: 9, subject: 'גיטרה', level: 'מתקדם' },
  { name: 'עמית ביטון', grade: 'כיתה ו', parent: 10, subject: 'גיטרה', level: 'ביניים' },
  { name: 'יובל לוי', grade: 'כיתה ד', parent: 0, subject: 'גיטרה', level: 'מתחילים' },
  { name: 'מיכאלה דגן', grade: 'כיתה ט', parent: 11, subject: 'כינור', level: 'מתקדם' },
  { name: 'נועם אלבז', grade: 'כיתה ח', parent: 12, subject: 'כינור', level: 'ביניים' },
  { name: 'אלה הרשקוביץ', grade: 'כיתה ז', parent: 13, subject: 'כינור', level: 'ביניים' },
  { name: 'רותם מזרחי', grade: 'כיתה יב', parent: 1, subject: 'כינור', level: 'מתקדם' },
  { name: 'שירה כרמי', grade: 'כיתה ה', parent: 9, subject: 'כינור', level: 'מתחילים' },
  { name: 'איה נחום', grade: 'כיתה ו', parent: 6, subject: 'כינור', level: 'מתחילים' },
]

/** Students on a flat monthly plan; the rest are billed per lesson. */
const SUBSCRIBED_STUDENTS = [0, 3, 6, 9, 12, 15]
const MONTHLY_PLAN_AMOUNT = 880
const PER_LESSON_PRICE = [240, 200, 220]

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

/** Local Supabase only, unless the caller opts out explicitly. */
function assertLocalTarget(url: string): void {
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:|\/|$)/.test(url)
  if (isLocal || process.env.VIDEO_DEMO_ALLOW_REMOTE === '1') return
  fail(
    `Refusing to seed a non-local Supabase: ${url}\n` +
      '  This script builds an eighteen-student fictional studio and is meant for\n' +
      '  the local stack (npx supabase start).\n' +
      '  Point NEXT_PUBLIC_SUPABASE_URL at 127.0.0.1:54321, or set\n' +
      '  VIDEO_DEMO_ALLOW_REMOTE=1 if you genuinely mean to seed a remote project.'
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  assertLocalTarget(supabaseUrl)

  const password = process.env.VIDEO_DEMO_PASSWORD ?? 'lessio-video-demo-2026'
  if (password.length < 12) fail('VIDEO_DEMO_PASSWORD must be at least 12 characters')

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const now = DateTime.now().setZone(TIMEZONE)

  console.log(`\nSeeding "${ORG_NAME}" → ${supabaseUrl}`)

  // ── 1. Auth users ───────────────────────────────────────────────────────────
  console.log('\n▸ משתמשים')
  const ownerUserId = await ensureAuthUser(db, OWNER_EMAIL, password, OWNER_NAME)
  const teacherUserIds: string[] = []
  for (const t of TEACHERS) {
    teacherUserIds.push(await ensureAuthUser(db, t.email, password, t.name))
  }

  // ── 2. Organization ─────────────────────────────────────────────────────────
  // onboarding_completed: filming starts on the product, not the wizard. Video 5
  // films the wizard from a separate brand-new signup instead.
  console.log('\n▸ ארגון')
  await expectOk(
    'upsert organization',
    db.from('organizations').upsert(
      {
        id: ORG_ID,
        name: ORG_NAME,
        slug: ORG_SLUG,
        timezone: TIMEZONE,
        currency: 'ILS',
        default_locale: 'he',
        billing_mode: 'monthly',
        group_pricing_mode: 'per_student',
        break_duration_minutes: 0,
        min_booking_notice_hours: 2,
        onboarding_completed: true,
        reminders_enabled: true,
        automation_lesson_reminder_enabled: true,
        automation_lesson_reminder_hours: 24,
        automation_cancellation_enabled: true,
        automation_payment_request_enabled: true,
        automation_dunning_enabled: true,
        automation_new_leads_enabled: true,
        ai_assistant_enabled: true,
        // Off on purpose: completing a lesson on camera should not try to send.
        auto_send_payment_request: false,
        business_legal_name: 'סטודיו מיכל למוזיקה בע"מ',
        business_address: 'הרצל 42, תל אביב',
      },
      { onConflict: 'id' }
    )
  )
  console.log(`  ✓ "${ORG_NAME}" [${ORG_ID}]`)

  // 24h → full charge, 2h → 50%. This is what produces the ₪60 line in the
  // video-1 WhatsApp mockup for a ₪120 half-price cancellation.
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
  console.log('  ✓ מדיניות ביטולים: 24 שעות מלא, פחות מ-24 → 50%')

  // ── 3. Profiles ─────────────────────────────────────────────────────────────
  console.log('\n▸ פרופילים')
  await expectOk(
    'upsert owner profile',
    db.from('profiles').upsert(
      {
        id: ownerUserId,
        organization_id: ORG_ID,
        full_name: OWNER_NAME,
        role: 'owner',
        is_active: true,
        preferred_locale: 'he',
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
          preferred_locale: 'he',
        },
        { onConflict: 'id' }
      )
    )
  }
  console.log(`  ✓ ${OWNER_NAME} (בעלים) + ${TEACHERS.length} מורים`)

  // ── 4. Teachers + weekly availability ───────────────────────────────────────
  console.log('\n▸ מורים')
  for (const [i, t] of TEACHERS.entries()) {
    await expectOk(
      `upsert teacher ${t.name}`,
      db.from('teachers').upsert(
        {
          id: teacherId(i),
          organization_id: ORG_ID,
          profile_id: teacherUserIds[i],
          hourly_rate: t.rate,
          bio: `מורה ל${t.subject}`,
          is_active: true,
        },
        { onConflict: 'id' }
      )
    )
    await expectOk(
      'clear availability',
      db.from('availability').delete().eq('teacher_id', teacherId(i))
    )
    // Sunday–Friday, so six weekday slots exist for six students per teacher.
    const rows = [0, 1, 2, 3, 4, 5].map((day) => ({
      organization_id: ORG_ID,
      teacher_id: teacherId(i),
      day_of_week: day,
      start_time: '14:00',
      end_time: '20:00',
    }))
    await expectOk('insert availability', db.from('availability').insert(rows))
    console.log(`  ✓ ${t.name} — ${t.subject}, ₪${t.rate}/שעה`)
  }

  // ── 5. SaaS subscription — 'advanced' unlocks every feature gate ────────────
  console.log('\n▸ מנוי פלטפורמה')
  const { data: plan } = await db
    .from('saas_plans')
    .select('id, name')
    .eq('name', 'advanced')
    .maybeSingle()
  if (!plan) fail("No saas_plans row named 'advanced' — run `npx supabase db reset` first")
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
  console.log("  ✓ מסלול 'advanced' — כל הפיצ'רים פתוחים")

  // ── 6. Wipe this org's transactional tables ────────────────────────────────
  console.log('\n▸ ניקוי הרצה קודמת')
  for (const table of [
    'charges',
    'student_monthly_billing',
    'student_cancellation_events',
    'lesson_notes',
    'homework_assignments',
    'student_goals',
    'subscriptions',
    'lessons',
    'notification_log',
  ]) {
    await expectOk(`clear ${table}`, db.from(table).delete().eq('organization_id', ORG_ID))
  }
  console.log('  ✓ שיעורים, חיובים, שיעורי בית, הערות ויעדים נוקו')

  // ── 7. Parents, students, relationships ────────────────────────────────────
  console.log('\n▸ הורים ותלמידים')
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
          // Opted out on purpose: these numbers are fictional, and a stray
          // reminder cron must never burn a send on them.
          opted_out_at: now.toISO(),
          consent_source: 'attested',
          consented_at: now.toISO(),
          welcome_sent_at: now.toISO(),
          preferred_locale: 'he',
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
          teacher_id: teacherId(Math.floor(i / 6)),
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
    `  ✓ ${PARENTS.length} הורים, ${STUDENTS.length} תלמידים ` +
      '(יעל לוי → נועה + יובל, כדי שבורר התלמידים בבוט יופיע)'
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
        start_date: now.minus({ months: 8 }).toISODate(),
        is_paused: false,
      })
    )
  }
  console.log(
    `  ✓ ${SUBSCRIBED_STUDENTS.length} תלמידים במנוי ₪${MONTHLY_PLAN_AMOUNT}/חודש, ` +
      `${STUDENTS.length - SUBSCRIBED_STUDENTS.length} לפי שיעור`
  )

  // ── 9. Lessons ─────────────────────────────────────────────────────────────
  // Teacher n owns hour 15+n and each of their six students a different weekday,
  // which satisfies the no_teacher_lesson_overlap constraint by construction.
  // 14:00 stays free for the showcase lesson.
  console.log('\n▸ שיעורים')
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
    const teacher = Math.floor(i / 6)
    const hour = 15 + teacher
    const weekday = i % 6
    const subscribed = SUBSCRIBED_STUDENTS.includes(i)

    for (let w = -WEEKS_BACK; w <= WEEKS_FORWARD; w++) {
      const start = thisSunday.plus({ weeks: w, days: weekday }).set({ hour, minute: 0 })
      const past = start < now
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
          cancel_reason: cancelled ? 'בוטל על ידי ההורה' : null,
        },
      })
    }
  }

  // The lesson filmed in video 1 — tomorrow 14:00, so it can never collide.
  const showcaseStart = now.plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 })
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
      continue
    }
    inserted++
    if (row.status === 'cancelled') {
      cancelledLessons.push({ id: row.id, student, start: row.start_at })
    }
  }
  console.log(
    `  ✓ ${inserted} שיעורים (${skipped} דולגו), ${cancelledLessons.length} מבוטלים\n` +
      `  ✓ שיעור התצוגה: ${showcaseStart.toFormat('dd/MM')} 14:00 — נועה לוי עם מיכל`
  )

  // ── 10. Cancellation events ────────────────────────────────────────────────
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
  console.log(`  ✓ ${events} אירועי ביטול (לסירוגין: באיחור / בזמן)`)

  // ── 11. Homework, lesson notes, learning goals ─────────────────────────────
  console.log('\n▸ פדגוגיה')
  const HOMEWORK = [
    { title: 'סולם דו מז\'ור — שתי ידיים', body: 'לתרגל את הסולם עולה ויורד, שתי אוקטבות, בקצב איטי עם מטרונום על 60.', status: 'done', due: -6 },
    { title: 'אטיוד מס\' 4 — צ\'רני', body: 'תיבות 1–16. לשים לב לאצבוע ביד שמאל בתיבה 9.', status: 'done', due: -3 },
    { title: 'שיר חופשי לבחירה', body: 'לבחור שיר אהוב ולנסות למצוא את המנגינה באוזן. נעבוד עליו יחד בשיעור.', status: 'pending', due: 2 },
    { title: 'אקורדים בסיסיים — Am, C, G', body: 'מעברים בין שלושת האקורדים, 5 דקות ביום. לצלם סרטון קצר אם אפשר.', status: 'overdue', due: -2 },
    { title: 'קצב 4/4 — תרגילי פריטה', body: 'תבנית פריטה למטה-למטה-למעלה, לחזור 20 פעם בלי לעצור.', status: 'pending', due: 3 },
    { title: 'תיאוריה: מרווחים', body: 'דף העבודה על מרווחים — שאלות 1 עד 12.', status: 'done', due: -5 },
    { title: 'ויברטו — תרגול יומי', body: 'חמש דקות ויברטו על מיתר לה, יד רפויה. בלי קשת בהתחלה.', status: 'pending', due: 4 },
    { title: 'קטע לנשף — חזרה', body: 'לנגן את הקטע מתחילתו ועד סופו שלוש פעמים ביום ללא עצירות.', status: 'done', due: -8 },
    { title: 'האזנה: קונצ\'רטו לכינור', body: 'להאזין לפרק הראשון ולכתוב שתי שורות על מה שאהבתם.', status: 'pending', due: 5 },
    { title: 'קריאת תווים — דף 12', body: 'קריאה ראשונה (prima vista) של שני הקטעים בדף.', status: 'overdue', due: -1 },
  ]
  for (const [i, hw] of HOMEWORK.entries()) {
    const student = i % STUDENTS.length
    await expectOk(
      `insert homework "${hw.title}"`,
      db.from('homework_assignments').insert({
        id: homeworkId(i),
        organization_id: ORG_ID,
        teacher_id: teacherId(Math.floor(student / 6)),
        student_id: studentId(student),
        title: hw.title,
        body: hw.body,
        due_date: now.plus({ days: hw.due }).toISODate(),
        status: hw.status,
        // Both, as the real send path writes them — `sent` is what the parent
        // portal filters on, `sent_at` is the timestamp the teacher sees.
        sent: true,
        sent_at: now.plus({ days: hw.due }).minus({ days: 5 }).toUTC().toISO(),
        completed_at:
          hw.status === 'done' ? now.plus({ days: hw.due }).minus({ days: 1 }).toUTC().toISO() : null,
      })
    )
  }
  for (const [n, i] of [0, 5].entries()) {
    await expectOk(
      'insert homework submission',
      db.from('homework_submissions').upsert(
        {
          organization_id: ORG_ID,
          assignment_id: homeworkId(i),
          student_id: studentId(i % STUDENTS.length),
          note: n === 0 ? 'תרגלתי כל יום, היד השמאלית עדיין קצת תקועה' : 'סיימתי את הדף, שאלה 9 הייתה קשה',
          score: n === 0 ? 94 : 81,
          feedback:
            n === 0
              ? 'עבודה יפה מאוד! הקצב יציב. בשבוע הבא נעלה את המטרונום ל-72.'
              : 'יפה. כדאי לחזור על ההגדרה של מרווח שלישית לפני השיעור הבא.',
          graded_at: now.minus({ days: 2 }).toUTC().toISO(),
          graded_by: ownerUserId,
        },
        { onConflict: 'assignment_id,student_id' }
      )
    )
  }
  console.log(`  ✓ ${HOMEWORK.length} שיעורי בית, 2 הגשות מדורגות`)

  const NOTES = [
    'עבדנו על הסולם בשתי ידיים. הקצב יציב, עדיין נוטה למהר בסוף הסולם.',
    'התקדמות יפה באטיוד. האצבוע בתיבה 9 סוף סוף נכנס.',
    'חזרנו על האקורדים — המעבר מ-Am ל-C כבר חלק. נוסיף אקורד רביעי בשבוע הבא.',
    'שיעור נעים. עבדנו על קריאת תווים, יש שיפור ברור לעומת החודש שעבר.',
    'הוויברטו מתחיל להישמע טבעי. להמשיך חמש דקות ביום.',
    'הכנה לנשף — הקטע מנוגן מתחילתו לסופו בלי עצירות. מוכנה.',
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
  console.log(`  ✓ ${recentCompleted?.length ?? 0} הערות שיעור`)

  const GOALS = [
    { student: 0, subject: 'פסנתר', description: 'לנגן את "לאלייז" מתחילתו לסופו בלי עצירות', status: 'active', months: 3 },
    { student: 0, subject: 'פסנתר', description: 'לשלוט בסולם דו מז\'ור בשתי ידיים', status: 'achieved', months: -1 },
    { student: 3, subject: 'פסנתר', description: 'לקרוא תווים בשני מפתחות ברצף', status: 'active', months: 2 },
    { student: 6, subject: 'גיטרה', description: 'לנגן שיר שלם עם שירה במקביל', status: 'active', months: 4 },
    { student: 12, subject: 'כינור', description: 'להופיע בנשף הסטודיו בסוף השנה', status: 'active', months: 5 },
    { student: 15, subject: 'כינור', description: 'לשלוט בוויברטו על כל המיתרים', status: 'achieved', months: -2 },
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
  console.log(`  ✓ ${GOALS.length} יעדי למידה`)

  // ── 12. Billing through the real engine ────────────────────────────────────
  // Past months settle fully. The current month is deliberately part-collected so
  // the debtors screen (video 2) has real names on it.
  console.log('\n▸ חיובים')
  const months: string[] = []
  for (let i = BILLING_MONTHS - 1; i >= 0; i--) {
    months.push(now.minus({ months: i }).toFormat('yyyy-MM'))
  }

  for (const [monthIndex, month] of months.entries()) {
    const isCurrentMonth = monthIndex === months.length - 1
    const fullyPaidMonth = !isCurrentMonth
    let monthTotal = 0
    let billed = 0
    let paidCount = 0

    for (const [i] of STUDENTS.entries()) {
      // Current month: every third student stays open → 6 debtors.
      const shouldBePaid = fullyPaidMonth || i % 3 !== 2
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

      const paidAt = isCurrentMonth
        ? now
            .startOf('month')
            .plus({
              days: Math.min(1 + ((i * 4) % Math.max(1, now.day - 1)), Math.max(0, now.day - 1)),
              hours: 9 + (i % 6),
            })
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
      `  ${month}: ₪${monthTotal.toFixed(2)} על פני ${billed} תלמידים` +
        (isCurrentMonth ? ` — ${paidCount} שולמו, ${billed - paidCount} פתוחים` : ' — שולם')
    )
  }

  // ── 13. Age the open charges ───────────────────────────────────────────────
  // Everything was inserted seconds ago, so /billing/debts would read
  // "oldest: 0 days ago" for every debtor. src/lib/charges/debtors.ts derives
  // the age from charges.created_at, so spreading those dates back gives the
  // debtors screen the lived-in look the video needs.
  const { data: openCharges } = await db
    .from('charges')
    .select('id')
    .eq('organization_id', ORG_ID)
    .neq('status', 'paid')
    .order('id')
  for (const [i, charge] of (openCharges ?? []).entries()) {
    await expectOk(
      'age open charge',
      db
        .from('charges')
        .update({ created_at: now.minus({ days: 8 + ((i * 5) % 19) }).toUTC().toISO() })
        .eq('id', charge.id)
    )
  }
  console.log(`  ✓ ${openCharges?.length ?? 0} חיובים פתוחים תוארכו אחורה (8–26 ימים)`)

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(
    '\n' +
      '─'.repeat(70) +
      '\nכניסה לסביבת הצילום\n' +
      '  URL:      http://localhost:3000/login\n' +
      `  Email:    ${OWNER_EMAIL}\n` +
      `  Password: ${password}\n` +
      '\nלצילום\n' +
      `  • שיעור התצוגה: ${showcaseStart.toFormat('dd/MM')} 14:00 — נועה לוי עם מיכל\n` +
      `  • חודש פתוח:    ${months[months.length - 1]} (מסך החייבים)\n` +
      `  • מורה לפורטל:  יעל לוי ${PARENTS[0].phone}\n` +
      '\nניקוי: npx tsx scripts/cleanup-video-demo.ts\n' +
      '─'.repeat(70)
  )
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
