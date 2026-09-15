/**
 * Seed "מרכז אופק ללמידה — DEMO" inside the existing video-demo organization.
 *
 * Builds, deterministically for a given --students N: 45 staff (43 teachers +
 * 2 secretaries) with weekly availability, families with siblings, N students,
 * ~N/9 groups, weekly series on a collision-free timetable, 22 weeks of
 * lessons (13 back, 8 forward) with cancellations / reschedules / make-ups /
 * no-shows, teacher days off, monthly packages, four months of billing through
 * the real engine, homework, notes, goals, exams, and local-only WhatsApp
 * conversations. Nothing is sent anywhere; no Graph, payment or mail call.
 *
 * The organizations row is UPDATEd for branding only. Integration columns
 * (whatsapp_*, wa_*, payment_*, receipt_*, google_*, gmail_*, ai_*) are read
 * before and after and the run aborts if any of them changed.
 *
 * Re-running with the SAME N is idempotent (rolls the showcase lesson to
 * tomorrow). For a different N, run wipe.ts first — the timetable is
 * allocated from scratch and cannot be merged into an existing one.
 *
 * Usage:
 *   CENTER_DEMO_ALLOW_REMOTE=1 VIDEO_DEMO_PASSWORD=<12+ chars> \
 *   npx tsx scripts/center-demo/seed.ts --org-id d3000000-0000-4000-8000-000000000000 --students 900
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** --dry-run: generate everything in memory, write nothing, call no engine. Proves the timetable fits. */
const DRY = process.argv.includes('--dry-run')

function stubClient(): SupabaseClient {
  const result = { data: null, error: null, count: 0 }
  const chain: any = new Proxy(() => chain, { // eslint-disable-line @typescript-eslint/no-explicit-any
    get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => void) => res(result) : chain),
    apply: () => chain,
  })
  return { from: () => chain, auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }), createUser: async () => ({ data: { user: { id: 'dry' } }, error: null }), updateUserById: async () => ({ error: null }) } } } as unknown as SupabaseClient
}
import { DateTime } from 'luxon'
import {
  ORG_ID, TZ, NEW_ORG_NAME, NEW_ORG_SLUG, OWNER_EMAIL, STAFF_EMAIL_DOMAIN, VERIFIED_PARENT_PHONE,
  T, uid, getClient, assertOrg, assertWaUnchanged, fail, expectOk, arg, upsertChunks, fetchAll,
  rng, pick, between, ensureAuthUser, chunk,
} from './shared'
import {
  STAFF, FIRST_NAMES_F, FIRST_NAMES_M, SURNAMES, GRADES, LEVELS, SUBJECT_GRADES, GROUP_MIX,
  PRIVATE_SUBJECTS, CANCEL_REASONS_PARENT, CANCEL_REASONS_TEACHER, RESCHEDULE_REASON, HOMEWORK,
  LESSON_NOTES, GOALS, EXAM_TITLES, LEAD_MESSAGES, type Subject,
} from './roster'
import { buildMonthForAllStudents } from '../../src/lib/billing/monthly/buildMonthForAllStudents'
import { monthlyChargeNote } from '../../src/lib/charges/renderNote'
import { resolveChargeDueDate } from '../../src/lib/billing/chargeDueDate'

const WEEKS_BACK = 13
const WEEKS_FWD = 8
const BILLING_MONTHS = 4
/** Share of each month that is already paid, oldest → current. */
const PAID_RATE = [0.97, 0.95, 0.82, 0.55]

type Row = Record<string, unknown>

// ── Timetable model ──────────────────────────────────────────────────────────

type Series = {
  idx: number
  kind: 'group' | 'private'
  groupIdx: number | null
  students: number[]
  teacher: number
  day: number
  hour: number
  duration: number
  subject: Subject
  price: number
}

type Student = {
  idx: number
  name: string
  family: number
  grade: string
  level: string
  subject: Subject
  status: 'active' | 'on_hold' | 'inactive'
  discount: number
  subscribed: boolean
  groupIdx: number | null
  teacher: number | null
}

type Family = { idx: number; parentName: string; surname: string; phone: string; kids: number[] }

class Timetable {
  private taken = new Map<number, Set<string>>()
  constructor(private r: () => number) {}

  private free(t: number, day: number, hour: number, hours: number): boolean {
    const s = STAFF[t]
    if (!s.days.includes(day) || hour < s.from || hour + hours > s.to) return false
    const set = this.taken.get(t)
    for (let h = hour; h < hour + hours; h++) if (set?.has(`${day}-${h}`)) return false
    return true
  }

  take(t: number, day: number, hour: number, hours: number): void {
    const set = this.taken.get(t) ?? new Set<string>()
    for (let h = hour; h < hour + hours; h++) set.add(`${day}-${h}`)
    this.taken.set(t, set)
  }

  /** A free (teacher, day, hour) for the subject, or null when every matching teacher is full. */
  allocate(subject: Subject, hours: number, opts: { day?: number; teacher?: number; avoidDay?: number } = {}): { teacher: number; day: number; hour: number } | null {
    let candidates = opts.teacher != null
      ? [opts.teacher]
      : STAFF.map((s, i) => (s.role === 'teacher' && s.subject === subject ? i : -1)).filter((i) => i >= 0)
    if (candidates.length === 0) candidates = STAFF.map((s, i) => (s.role === 'teacher' && s.subject === 'תגבור' ? i : -1)).filter((i) => i >= 0)
    const shuffled = [...candidates].sort(() => this.r() - 0.5)
    for (const t of shuffled) {
      const slots: Array<[number, number]> = []
      for (const day of STAFF[t].days) {
        if (opts.day != null && day !== opts.day) continue
        if (opts.avoidDay != null && day === opts.avoidDay) continue
        for (let h = STAFF[t].from; h + hours <= STAFF[t].to; h++) if (this.free(t, day, h, hours)) slots.push([day, h])
      }
      if (slots.length === 0) continue
      const [day, hour] = pick(this.r, slots)
      this.take(t, day, hour, hours)
      return { teacher: t, day, hour }
    }
    return null
  }

  /** Free slot for a one-off lesson on a given week (day, hour) that is not a series slot. */
  oneOff(t: number, used: Set<string>, r: () => number): { day: number; hour: number } | null {
    const slots: Array<[number, number]> = []
    for (const day of STAFF[t].days) {
      for (let h = STAFF[t].from; h + 1 <= STAFF[t].to; h++) {
        if (this.free(t, day, h, 1) && !used.has(`${day}-${h}`)) slots.push([day, h])
      }
    }
    if (slots.length === 0) return null
    const [day, hour] = pick(r, slots)
    return { day, hour }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = DRY ? stubClient() : getClient()
  const N = Number(arg('--students') ?? '900')
  if (!Number.isInteger(N) || N < 20 || N > 1200) fail('--students must be an integer between 20 and 1200')
  const password = process.env.VIDEO_DEMO_PASSWORD
  if (!password || password.length < 12) fail('VIDEO_DEMO_PASSWORD (≥12 chars) is required — it becomes the demo login password')

  const { name: orgName, wa: waBefore } = DRY ? { name: '(dry run)', wa: {} } : await assertOrg(db)
  const now = DateTime.now().setZone(TZ)
  const thisSunday = now.minus({ days: now.weekday % 7 }).startOf('day')
  console.log(`\nSeeding "${NEW_ORG_NAME}" (currently "${orgName}") with ${N} students → ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)

  // Same-N reruns are fine; a different N must start from a wipe.
  const { count: existingStudents } = await db.from('students').select('*', { count: 'exact', head: true }).eq('organization_id', ORG_ID)
  if ((existingStudents ?? 0) > 0 && existingStudents !== N) {
    fail(`Org already has ${existingStudents} students — run scripts/center-demo/wipe.ts before seeding a different size`)
  }

  // ── 1. Branding + owner ─────────────────────────────────────────────────────
  console.log('\n▸ ארגון ובעלים')
  await expectOk('rebrand organization', db.from('organizations').update({
    name: NEW_ORG_NAME,
    slug: NEW_ORG_SLUG,
    business_legal_name: 'מרכז אופק ללמידה בע"מ',
    business_address: 'דרך השלום 18, פתח תקווה',
    logo_url: null,
    default_locale: 'he',
    timezone: TZ,
    currency: 'ILS',
    billing_mode: 'monthly',
    group_pricing_mode: 'per_student',
    default_individual_hourly_rate: 200,
    group_price_per_student: 140,
    pair_price_per_student: 160,
    subscription_covered_lesson_types: ['individual', 'pair', 'group', 'custom'],
    onboarding_completed: true,
    auto_send_payment_request: false,
    updated_at: new Date().toISOString(),
  }).eq('id', ORG_ID))

  const { data: ownerProfile } = await db.from('profiles').select('id, full_name').eq('organization_id', ORG_ID).eq('role', 'owner').maybeSingle()
  if (!ownerProfile && !DRY) fail('Owner profile not found in the org')
  const ownerId = (ownerProfile?.id as string | undefined) ?? '00000000-0000-4000-8000-000000000000'
  const ownerName = 'רונית כהן'
  await ensureAuthUser(db, OWNER_EMAIL, password, ownerName)
  await expectOk('owner profile', db.from('profiles').update({ full_name: ownerName, preferred_locale: 'he', is_active: true }).eq('id', ownerId))
  await expectOk('cancellation policy', db.from('cancellation_policies').upsert(
    { organization_id: ORG_ID, notice_hours_full: 24, notice_hours_partial: 2, partial_charge_percent: 50 },
    { onConflict: 'organization_id' }
  ))
  const { data: centerPlan } = await db.from('saas_plans').select('id').eq('name', 'center').maybeSingle()
  if (centerPlan) {
    await expectOk('plan → center', db.from('organization_subscriptions').update({ plan_id: centerPlan.id, updated_at: new Date().toISOString() }).eq('organization_id', ORG_ID))
  }
  console.log(`  ✓ "${NEW_ORG_NAME}", בעלים ${ownerName} (${OWNER_EMAIL})${centerPlan ? ', מסלול center' : ''}`)

  // ── 2. Staff ────────────────────────────────────────────────────────────────
  console.log('\n▸ צוות')
  const profileIdOf: string[] = []
  for (const [i, s] of STAFF.entries()) {
    const email = `ofek.staff${String(i + 1).padStart(2, '0')}@${STAFF_EMAIL_DOMAIN}`
    profileIdOf[i] = await ensureAuthUser(db, email, password, s.name)
  }
  await upsertChunks(db, 'profiles', STAFF.map((s, i) => ({
    id: profileIdOf[i], organization_id: ORG_ID, full_name: s.name, role: s.role, is_active: true, preferred_locale: 'he',
  })))
  const teacherIdx = STAFF.map((s, i) => (s.role === 'teacher' ? i : -1)).filter((i) => i >= 0)
  const tid = (i: number): string => uid(T.teacher, i)
  await upsertChunks(db, 'teachers', teacherIdx.map((i) => ({
    id: tid(i), organization_id: ORG_ID, profile_id: profileIdOf[i], hourly_rate: STAFF[i].rate,
    bio: `מורה ל${STAFF[i].subject}`, is_active: true, break_duration_minutes: 0,
  })))
  const availRows: Row[] = []
  for (const i of teacherIdx) for (const day of STAFF[i].days) {
    availRows.push({ id: uid(T.availability, i * 8 + day), organization_id: ORG_ID, teacher_id: tid(i), day_of_week: day, start_time: `${String(STAFF[i].from).padStart(2, '0')}:00`, end_time: `${String(STAFF[i].to).padStart(2, '0')}:00` })
  }
  await upsertChunks(db, 'availability', availRows)
  console.log(`  ✓ ${teacherIdx.length} מורים + ${STAFF.length - teacherIdx.length} מזכירות, ${availRows.length} חלונות זמינות`)

  // ── 3. Holidays + teacher days off ──────────────────────────────────────────
  const holidays = new Set(
    (await fetchAll<{ date: string }>(db, 'organization_holidays', 'date', (q) => q.eq('organization_id', ORG_ID))).map((h) => h.date.slice(0, 10))
  )
  const rOff = rng(11)
  const offDates = new Map<number, Set<string>>()
  const overrideRows: Row[] = []
  const OFF_REASONS = ['חופשה', 'מילואים', 'מחלה', 'השתלמות']
  for (let k = 0; k < 12; k++) {
    const t = teacherIdx[(k * 7) % teacherIdx.length]
    const dayOffset = k < 9 ? -between(rOff, 3, 60) : between(rOff, 5, 30)
    let d = now.plus({ days: dayOffset }).startOf('day')
    while (!STAFF[t].days.includes(d.weekday % 7)) d = d.plus({ days: 1 })
    const iso = d.toISODate()!
    offDates.set(t, (offDates.get(t) ?? new Set()).add(iso))
    overrideRows.push({ id: uid(T.override, k), organization_id: ORG_ID, teacher_id: tid(t), override_date: iso, is_available: false, start_time: null, end_time: null, reason: pick(rOff, OFF_REASONS) })
  }
  await upsertChunks(db, 'availability_overrides', overrideRows)
  await upsertChunks(db, 'day_off_requests', [0, 9, 10].map((k, n) => {
    const o = overrideRows[k]
    const past = n === 0
    return {
      id: uid(T.dayOff, n), organization_id: ORG_ID, teacher_id: o.teacher_id, start_date: o.override_date, end_date: o.override_date,
      status: past ? 'approved' : 'pending', requested_at: now.minus({ days: past ? 70 : 2 }).toUTC().toISO(),
      decided_by: past ? ownerId : null, decided_at: past ? now.minus({ days: 69 }).toUTC().toISO() : null,
      lessons_cancelled: past ? 4 : 0, parents_notified: past ? 4 : 0,
    }
  }))
  console.log(`  ✓ ${holidays.size} חגים, ${overrideRows.length} ימי היעדרות, 3 בקשות חופש`)

  // ── 4. Families, students, groups ──────────────────────────────────────────
  console.log('\n▸ משפחות, תלמידים וקבוצות')
  const r = rng(N * 7919 + 17)
  const G = Math.min(100, Math.max(3, Math.round(N / 9)))
  const privateCount = Math.round(N / 3)
  const groupPool = N - privateCount

  // Groups: subject mix scaled to G; groups 0 and 1 are the Monday / Wednesday
  // מתמטיקה כיתה ו' pair the "move Yoav to the Wednesday group" scenario needs.
  type Group = { idx: number; name: string; subject: Subject; gradeIdx: number; duration: 60 | 90; members: number[]; price: number; days: number[] }
  const groups: Group[] = []
  const mixCounts = GROUP_MIX.map((m) => Math.max(0, Math.round((m.count * G) / 100)))
  while (mixCounts.reduce((a, b) => a + b, 0) > G) mixCounts[mixCounts.indexOf(Math.max(...mixCounts))]--
  while (mixCounts.reduce((a, b) => a + b, 0) < G) mixCounts[0]++
  const perSubjectSeq = new Map<string, number>()
  for (const [mi, m] of GROUP_MIX.entries()) {
    for (let k = 0; k < mixCounts[mi]; k++) {
      const idx = groups.length
      const forced = idx < 2 ? { subject: 'מתמטיקה' as Subject, gradeIdx: 5 } : null
      const subject = forced?.subject ?? m.subject
      const gradeIdx = forced?.gradeIdx ?? pick(r, SUBJECT_GRADES[subject])
      const seqKey = `${subject}-${gradeIdx}`
      const seq = (perSubjectSeq.get(seqKey) ?? 0) + 1
      perSubjectSeq.set(seqKey, seq)
      const tmpl = forced ? GROUP_MIX[0].nameTemplate : m.nameTemplate
      const isBagrut = subject.startsWith('הכנה לבגרות')
      groups.push({
        idx, name: tmpl(GRADES[gradeIdx], seq), subject, gradeIdx, duration: forced ? 60 : m.duration, members: [],
        price: isBagrut ? between(r, 170, 200) : between(r, 125, 160), days: [],
      })
    }
  }
  // Member counts: base share of the pool, jittered ±1 in pairs so the total holds.
  const sizes = groups.map(() => Math.floor(groupPool / G))
  for (let i = 0; i + 1 < sizes.length; i += 2) { const j = between(r, 0, 1); sizes[i] += j; sizes[i + 1] -= j }
  for (let i = 0; i < groupPool - sizes.reduce((a, b) => a + b, 0); i++) sizes[i % G]++

  const families: Family[] = []
  const students: Student[] = []
  const FAMILY_SIZE = [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3]
  const newFamily = (): Family => {
    const idx = families.length
    const surname = pick(r, SURNAMES)
    const f: Family = {
      idx, surname,
      parentName: `${pick(r, r() < 0.6 ? FIRST_NAMES_F : FIRST_NAMES_M)} ${surname}`,
      phone: `+972500${String(100001 + idx).padStart(6, '0')}`,
      kids: [],
    }
    families.push(f)
    return f
  }
  const verifiedFamily = newFamily()
  verifiedFamily.parentName = 'יעל לוי'
  verifiedFamily.surname = 'לוי'
  verifiedFamily.phone = VERIFIED_PARENT_PHONE

  let openFamily: Family | null = verifiedFamily
  let openFamilyLeft = 2
  const addStudent = (subject: Subject, gradeIdx: number, groupIdx: number | null, forcedName?: string): Student => {
    if (!openFamily || openFamilyLeft === 0) { openFamily = newFamily(); openFamilyLeft = pick(r, FAMILY_SIZE) }
    const fam = openFamily
    const idx = students.length
    const female = r() < 0.5
    const statusRoll = r()
    const s: Student = {
      idx, family: fam.idx,
      name: forcedName ?? `${pick(r, female ? FIRST_NAMES_F : FIRST_NAMES_M)} ${fam.surname}`,
      grade: GRADES[gradeIdx], level: pick(r, LEVELS), subject,
      status: statusRoll < 0.85 ? 'active' : statusRoll < 0.93 ? 'on_hold' : 'inactive',
      discount: fam.kids.length === 1 ? 10 : fam.kids.length >= 2 ? 15 : 0,
      subscribed: r() < 0.55,
      groupIdx, teacher: null,
    }
    fam.kids.push(idx)
    openFamilyLeft--
    students.push(s)
    return s
  }
  // The verified family: נועה (private English) and יואב (Monday math group).
  const noa = addStudent('אנגלית', 8, null, 'נועה לוי'); noa.status = 'active'; noa.subscribed = true
  const yoav = addStudent('מתמטיקה', 5, 0, 'יואב לוי'); yoav.status = 'active'; yoav.subscribed = true
  groups[0].members.push(yoav.idx)
  openFamily = null
  for (let p = 1; p < privateCount; p++) {
    const subject = pick(r, PRIVATE_SUBJECTS)
    addStudent(subject, pick(r, SUBJECT_GRADES[subject]), null)
  }
  for (const g of groups) {
    while (g.members.length < Math.max(3, sizes[g.idx])) {
      const s = addStudent(g.subject, g.gradeIdx, g.idx)
      g.members.push(s.idx)
    }
  }
  while (students.length < N) { const g = groups[students.length % G]; const s = addStudent(g.subject, g.gradeIdx, g.idx); g.members.push(s.idx) }

  const pid = (f: number): string => uid(T.parent, f)
  const sid = (s: number): string => uid(T.student, s)
  const gid = (g: number): string => uid(T.group, g)
  const nowIso = now.toUTC().toISO()!
  await upsertChunks(db, 'parents', families.map((f) => ({
    id: pid(f.idx), organization_id: ORG_ID, full_name: f.parentName, phone: f.phone, is_active: true, preferred_locale: 'he',
    relation_type: r() < 0.6 ? 'mother' : 'father',
    // Every fictional number is opted out so no cron can ever message it. Only the Meta-verified recipient may receive.
    opted_out_at: f.phone === VERIFIED_PARENT_PHONE ? null : nowIso,
    consent_source: 'attested', consented_at: nowIso, welcome_sent_at: nowIso,
  })))
  console.log(`  ✓ ${families.length} משפחות (${families.filter((f) => f.kids.length > 1).length} עם אחים)`)

  // ── 5. Timetable: series for groups and private students ───────────────────
  const tt = new Timetable(rng(N * 31 + 5))
  const series: Series[] = []
  const teacherOf = new Map<number, number>()
  const addSeries = (kind: Series['kind'], groupIdx: number | null, studs: number[], subject: Subject, duration: number, price: number, opts: { day?: number; teacher?: number; avoidDay?: number } = {}): Series | null => {
    const slot = tt.allocate(subject, duration > 60 ? 2 : 1, opts)
    if (!slot) return null
    const s: Series = { idx: series.length, kind, groupIdx, students: studs, teacher: slot.teacher, day: slot.day, hour: slot.hour, duration, subject, price }
    series.push(s)
    return s
  }
  for (const g of groups) {
    const forcedDay = g.idx === 0 ? 1 : g.idx === 1 ? 3 : undefined
    const first = addSeries('group', g.idx, g.members, g.subject, g.duration, g.price, { day: forcedDay })
    if (!first) fail(`No free slot for group ${g.name}`)
    g.days.push(first.day)
    const twice = g.subject.startsWith('הכנה לבגרות') || r() < 0.25
    if (twice) {
      const second = addSeries('group', g.idx, g.members, g.subject, g.duration, g.price, { teacher: first.teacher, avoidDay: first.day })
      if (second) g.days.push(second.day)
    }
    for (const m of g.members) { students[m].teacher = first.teacher; teacherOf.set(m, first.teacher) }
  }
  for (const s of students) {
    if (s.groupIdx != null) continue
    const rate = (t: number) => STAFF[t].rate
    const opts = s.idx === noa.idx ? { day: 2 } : {}
    const first = addSeries('private', null, [s.idx], s.subject, 45, 0, opts)
    if (!first) { s.status = 'inactive'; continue }
    first.price = rate(first.teacher)
    s.teacher = first.teacher
    if (r() < 0.25) {
      const second = addSeries('private', null, [s.idx], s.subject, 45, 0, { teacher: first.teacher, avoidDay: first.day })
      if (second) second.price = rate(second.teacher)
    }
  }
  // Make sure Noa's teacher has a Thursday, so "move to Thursday" can be answered.
  const noaSeries = series.find((x) => x.kind === 'private' && x.students[0] === noa.idx)!
  if (!STAFF[noaSeries.teacher].days.includes(4)) console.warn('  ⚠ Noa\'s teacher has no Thursday slot')

  await upsertChunks(db, 'students', students.map((s) => ({
    id: sid(s.idx), organization_id: ORG_ID, full_name: s.name, grade: s.grade, level: s.level, focused_subject: s.subject,
    status: s.status, weekly_quota: series.filter((x) => x.students.includes(s.idx)).length || 1,
    teacher_id: s.teacher != null ? tid(s.teacher) : null,
    discount_percent: s.discount || null, discount_reason: s.discount ? 'הנחת אחים' : null,
  })))
  await upsertChunks(db, 'relationships', students.map((s) => ({
    organization_id: ORG_ID, parent_id: pid(s.family), student_id: sid(s.idx), is_primary: true,
  })), 'parent_id,student_id')
  await upsertChunks(db, 'student_groups', groups.map((g) => ({ id: gid(g.idx), organization_id: ORG_ID, name: g.name, status: 'active' })))
  await upsertChunks(db, 'student_group_members', groups.flatMap((g) => g.members.map((m) => ({ group_id: gid(g.idx), student_id: sid(m) }))), 'group_id,student_id')
  console.log(`  ✓ ${students.length} תלמידים (${students.filter((s) => s.status === 'active').length} פעילים), ${groups.length} קבוצות, ${series.length} סדרות שבועיות`)

  // ── 6. Packages ─────────────────────────────────────────────────────────────
  const subRows: Row[] = []
  for (const s of students) {
    if (!s.subscribed || s.status === 'inactive') continue
    const own = series.filter((x) => x.students.includes(s.idx))
    const amount = s.groupIdx != null ? between(r, 48, 64) * 10 : own.length > 1 ? between(r, 140, 190) * 10 : between(r, 76, 104) * 10
    subRows.push({
      id: uid(T.subscription, s.idx), organization_id: ORG_ID, student_id: sid(s.idx), subscription_type: 'monthly', monthly_amount: amount,
      start_date: now.minus({ months: between(r, 4, 14) }).startOf('month').toISODate(), is_paused: s.status === 'on_hold', pause_date: s.status === 'on_hold' ? now.minus({ days: 10 }).toISODate() : null,
    })
  }
  await upsertChunks(db, 'subscriptions', subRows)
  console.log(`  ✓ ${subRows.length} מנויים חודשיים`)

  // ── 7. Lessons ──────────────────────────────────────────────────────────────
  console.log('\n▸ שיעורים')
  const rl = rng(N * 101 + 3)
  const lessonRows: Row[] = []
  const lsRows: Row[] = []
  const eventRows: Row[] = []
  const seriesRows: Row[] = []
  const extraNotes: Array<{ lessonId: string; teacher: number; body: string }> = []
  const completedLessons: Array<{ id: string; teacher: number; students: number[]; subject: Subject; start: DateTime }> = []
  const oneOffUsed = new Map<string, Set<string>>() // `${teacher}-${week}` → slots
  let extraSeq = 0
  let eventSeq = 0
  let cancelled = 0, rescheduled = 0, noShow = 0, unlogged = 0
  const isoDate = (d: DateTime) => d.toISODate()!
  const untilDate = thisSunday.plus({ weeks: WEEKS_FWD + 1 }).toISODate()

  for (const s of series) {
    seriesRows.push({
      id: uid(T.series, s.idx), organization_id: ORG_ID, teacher_id: tid(s.teacher), student_id: sid(s.students[0]),
      group_id: s.groupIdx != null ? gid(s.groupIdx) : null, created_by: ownerId,
      created_at: thisSunday.minus({ weeks: WEEKS_BACK + 2 }).toUTC().toISO(),
      rule: { frequency: 'weekly', day_of_week: s.day, start_time: `${String(s.hour).padStart(2, '0')}:00`, duration_minutes: s.duration, until: untilDate },
    })
    for (let w = -WEEKS_BACK; w <= WEEKS_FWD; w++) {
      const day = thisSunday.plus({ weeks: w, days: s.day })
      const date = isoDate(day)
      if (holidays.has(date)) continue
      const start = day.set({ hour: s.hour })
      const end = start.plus({ minutes: s.duration })
      const past = end < now
      const lessonId = uid(T.lesson, s.idx * 32 + (w + WEEKS_BACK))
      const teacherOff = offDates.get(s.teacher)?.has(date) ?? false
      const enrolled = s.students.filter((st) => students[st].status !== 'inactive' || w < -4)

      let status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' = past ? 'completed' : 'scheduled'
      let reason: string | null = null
      const roll = rl()
      if (teacherOff) { status = 'cancelled'; reason = pick(rl, CANCEL_REASONS_TEACHER) }
      else if (s.kind === 'private' && past && roll < 0.07) { status = 'cancelled'; reason = pick(rl, CANCEL_REASONS_PARENT) }
      else if (s.kind === 'private' && past && roll < 0.09) { status = 'cancelled'; reason = RESCHEDULE_REASON }
      else if (s.kind === 'group' && past && roll < 0.03) { status = 'cancelled'; reason = 'המורה חולה' }
      else if (s.kind === 'private' && past && roll < 0.105) { status = 'no_show' }
      else if (s.kind === 'private' && !past && roll < 0.02) { status = 'cancelled'; reason = 'ההורה ביטל מראש' }
      else if (past && end > now.minus({ days: 4 }) && roll < 0.35) { status = 'scheduled' }
      if (status === 'cancelled') cancelled++
      if (status === 'no_show') noShow++
      if (status === 'scheduled' && past) unlogged++

      lessonRows.push({
        id: lessonId, organization_id: ORG_ID, teacher_id: tid(s.teacher), series_id: uid(T.series, s.idx),
        group_id: s.groupIdx != null ? gid(s.groupIdx) : null,
        start_at: start.toUTC().toISO(), end_at: end.toUTC().toISO(), status, cancel_reason: reason,
        lesson_type: s.kind === 'group' ? 'group' : 'individual', max_students: s.kind === 'group' ? 8 : 1,
        price_per_student: s.price,
        completed_at: status === 'completed' ? end.plus({ minutes: 5 }).toUTC().toISO() : null,
        completion_source: status === 'completed' ? (rl() < 0.8 ? 'automatic' : 'manual') : null,
        created_at: thisSunday.minus({ weeks: WEEKS_BACK + 2 }).toUTC().toISO(),
      })
      if (status === 'completed') completedLessons.push({ id: lessonId, teacher: s.teacher, students: enrolled, subject: s.subject, start })

      for (const st of enrolled) {
        // A single group member cancelling: the lesson stays, the seat is cancelled and an event is logged.
        const memberCancel = s.kind === 'group' && past && status === 'completed' && rl() < 0.06
        const lsStatus = status === 'cancelled' && reason !== RESCHEDULE_REASON && !teacherOff && reason !== 'המורה חולה' ? 'cancelled' : memberCancel ? 'cancelled' : 'enrolled'
        lsRows.push({ organization_id: ORG_ID, lesson_id: lessonId, student_id: sid(st), status: lsStatus })
        if (lsStatus === 'cancelled') {
          const late = rl() < 0.5
          const hoursBefore = late ? between(rl, 2, 20) : between(rl, 26, 96)
          eventRows.push({
            id: uid(T.cancelEvent, eventSeq++), organization_id: ORG_ID, lesson_id: lessonId, student_id: sid(st),
            cancellation_date: start.minus({ hours: hoursBefore }).toUTC().toISO(), hours_before: hoursBefore, is_lt_24h: late,
            is_charged: true, policy_amount: late ? Math.round(s.price * 0.5) : null, billing_month: start.toFormat('yyyy-MM'),
          })
        }
      }

      // Reschedule → make-up lesson in a free slot the same or next week.
      if (reason === RESCHEDULE_REASON) {
        // Make-ups later the same week land in week w, earlier weekdays roll to w+1 — the
        // per-(teacher, week) set must be keyed by the week the lesson actually lands in.
        const usedNow = oneOffUsed.get(`${s.teacher}-${w}`) ?? new Set<string>()
        const usedNext = oneOffUsed.get(`${s.teacher}-${w + 1}`) ?? new Set<string>()
        const slot = tt.oneOff(s.teacher, new Set([...usedNow, ...usedNext]), rl)
        if (slot) {
          const targetWeek = slot.day > s.day ? w : w + 1
          const used = targetWeek === w ? usedNow : usedNext
          used.add(`${slot.day}-${slot.hour}`); oneOffUsed.set(`${s.teacher}-${targetWeek}`, used)
          const mStart = thisSunday.plus({ weeks: targetWeek, days: slot.day }).set({ hour: slot.hour })
          const mEnd = mStart.plus({ minutes: 45 })
          const mPast = mEnd < now
          const mId = uid(T.extraLesson, extraSeq++)
          lessonRows.push({
            id: mId, organization_id: ORG_ID, teacher_id: tid(s.teacher), series_id: null, group_id: null,
            start_at: mStart.toUTC().toISO(), end_at: mEnd.toUTC().toISO(), status: mPast ? 'completed' : 'scheduled', cancel_reason: null,
            lesson_type: 'individual', max_students: 1, price_per_student: s.price,
            completed_at: mPast ? mEnd.toUTC().toISO() : null, completion_source: mPast ? 'automatic' : null,
            created_at: start.minus({ days: 2 }).toUTC().toISO(),
          })
          lsRows.push({ organization_id: ORG_ID, lesson_id: mId, student_id: sid(s.students[0]), status: 'enrolled' })
          extraNotes.push({ lessonId: mId, teacher: s.teacher, body: `שיעור השלמה במקום ${start.toFormat('dd/MM')}` })
          rescheduled++
        }
      }
    }
  }

  // Showcase lesson for the live WhatsApp demo: Noa, tomorrow, in a free hour of her teacher.
  const showcaseId = uid(T.extraLesson, 0xfffff)
  {
    const tomorrow = now.plus({ days: 1 }).startOf('day')
    const tDay = tomorrow.weekday % 7
    const t = noaSeries.teacher
    let hour: number | null = null
    for (let h = STAFF[t].from; h < STAFF[t].to; h++) {
      const candStart = tomorrow.set({ hour: h }), candEnd = candStart.plus({ minutes: 45 })
      const clash = lessonRows.some((l) => l.teacher_id === tid(t) && l.status !== 'cancelled' &&
        DateTime.fromISO(l.start_at as string) < candEnd && DateTime.fromISO(l.end_at as string) > candStart)
      if (!clash && STAFF[t].days.includes(tDay)) { hour = h; break }
    }
    if (hour != null) {
      const st = tomorrow.set({ hour })
      lessonRows.push({
        id: showcaseId, organization_id: ORG_ID, teacher_id: tid(t), series_id: null, group_id: null,
        start_at: st.toUTC().toISO(), end_at: st.plus({ minutes: 45 }).toUTC().toISO(), status: 'scheduled', cancel_reason: null,
        lesson_type: 'individual', max_students: 1, price_per_student: noaSeries.price, completed_at: null, completion_source: null,
        created_at: nowIso,
      })
      lsRows.push({ organization_id: ORG_ID, lesson_id: showcaseId, student_id: sid(noa.idx), status: 'enrolled' })
      console.log(`  ✓ שיעור התצוגה: ${st.toFormat('dd/MM')} ${st.toFormat('HH:mm')} — נועה לוי עם ${STAFF[t].name}`)
    } else {
      console.warn('  ⚠ no free hour tomorrow for the showcase lesson')
    }
  }

  await upsertChunks(db, 'lesson_series', seriesRows)
  // Rerun safety: the showcase lesson moves, so drop the previous one and any stale seats.
  await db.from('lesson_students').delete().eq('organization_id', ORG_ID).eq('lesson_id', showcaseId)
  await db.from('lessons').delete().eq('organization_id', ORG_ID).eq('id', showcaseId)
  // The DB enforces no_teacher_lesson_overlap (GiST) — prove it in memory first so a 500-row batch never fails mid-way.
  {
    const byTeacher = new Map<string, Array<[number, number, string]>>()
    for (const l of lessonRows) {
      if (l.status === 'cancelled') continue
      const arr = byTeacher.get(l.teacher_id as string) ?? []
      arr.push([Date.parse(l.start_at as string), Date.parse(l.end_at as string), l.id as string])
      byTeacher.set(l.teacher_id as string, arr)
    }
    let overlaps = 0
    for (const arr of byTeacher.values()) {
      arr.sort((x, y) => x[0] - y[0])
      for (let i = 1; i < arr.length; i++) if (arr[i][0] < arr[i - 1][1]) { overlaps++; if (overlaps <= 3) console.warn('  ⚠ overlap', arr[i - 1][2], arr[i][2]) }
    }
    if (overlaps > 0) fail(`${overlaps} teacher overlaps in the generated timetable`)
    console.log('  ✓ אין חפיפות מורה בלוח שנוצר')
  }
  await upsertChunks(db, 'lessons', lessonRows)
  await upsertChunks(db, 'lesson_students', lsRows, 'lesson_id,student_id')
  await upsertChunks(db, 'student_cancellation_events', eventRows)
  console.log(`  ✓ ${lessonRows.length} שיעורים (${cancelled} מבוטלים, ${rescheduled} הועברו+השלמה, ${noShow} לא הגיעו, ${unlogged} טרם תועדו), ${lsRows.length} שיבוצים, ${eventRows.length} אירועי ביטול`)

  // ── 8. Pedagogy ─────────────────────────────────────────────────────────────
  console.log('\n▸ פדגוגיה')
  const rp = rng(N * 13 + 9)
  const hwRows: Row[] = []
  const subRowsHw: Row[] = []
  let hwSeq = 0
  for (const s of students) {
    if (s.status === 'inactive' || s.teacher == null || rp() > 0.4) continue
    const n = rp() < 0.3 ? 2 : 1
    for (let k = 0; k < n; k++) {
      const bank = HOMEWORK[s.subject] ?? HOMEWORK['תגבור']
      const hw = pick(rp, bank)
      const dueOffset = between(rp, -20, 14)
      const due = now.plus({ days: dueOffset })
      const pastDue = dueOffset < 0
      const status = pastDue ? (rp() < 0.6 ? 'done' : 'overdue') : 'pending'
      const id = uid(T.homework, hwSeq++)
      hwRows.push({
        id, organization_id: ORG_ID, teacher_id: tid(s.teacher), student_id: sid(s.idx), title: hw.title, body: hw.body,
        due_date: due.toISODate(), status, sent: true, sent_at: due.minus({ days: 6 }).toUTC().toISO(),
        completed_at: status === 'done' ? due.minus({ days: 1 }).toUTC().toISO() : null,
      })
      if (status === 'done' && subRowsHw.length < 60) {
        subRowsHw.push({
          organization_id: ORG_ID, assignment_id: id, student_id: sid(s.idx), note: pick(rp, ['סיימתי, שאלה 4 הייתה קשה', 'תרגלתי כל יום', 'צירפתי צילום של הדף', 'עשיתי חצי, לא הבנתי את ההמשך']),
          score: between(rp, 70, 100), feedback: pick(rp, ['עבודה יפה!', 'כל הכבוד, ממשיכים ככה', 'שים לב לסימנים, אחרת מצוין', 'נעבור על שאלה 4 בשיעור']),
          graded_at: due.toUTC().toISO(), graded_by: ownerId, submitted_at: due.minus({ days: 1 }).toUTC().toISO(),
        })
      }
    }
  }
  await upsertChunks(db, 'homework_assignments', hwRows)
  await upsertChunks(db, 'homework_submissions', subRowsHw, 'assignment_id,student_id')

  const noteRows: Row[] = []
  const notesTarget = Math.round(N * 0.67)
  for (let k = 0; k < notesTarget && k < completedLessons.length; k++) {
    const l = completedLessons[Math.floor((k * 7919) % completedLessons.length)]
    noteRows.push({ id: uid(T.note, k), organization_id: ORG_ID, lesson_id: l.id, teacher_id: tid(l.teacher), body: pick(rp, LESSON_NOTES), visible_to_parent: rp() < 0.5, created_at: l.start.plus({ hours: 1 }).toUTC().toISO() })
  }
  for (const [k, n] of extraNotes.entries()) {
    noteRows.push({ id: uid(T.note, 0x10000 + k), organization_id: ORG_ID, lesson_id: n.lessonId, teacher_id: tid(n.teacher), body: n.body, visible_to_parent: true, created_at: nowIso })
  }
  await upsertChunks(db, 'lesson_notes', noteRows)

  const goalRows: Row[] = []
  for (let k = 0; k < Math.round(N * 0.22); k++) {
    const s = students[(k * ered(k)) % students.length]
    const g = GOALS.find((x) => x.subject === s.subject) ?? pick(rp, GOALS)
    const achieved = rp() < 0.2
    goalRows.push({ id: uid(T.goal, k), organization_id: ORG_ID, student_id: sid(s.idx), subject: s.subject, description: g.description, target_date: now.plus({ months: g.months }).toISODate(), status: achieved ? 'achieved' : 'active', created_by: ownerId })
  }
  await upsertChunks(db, 'student_goals', goalRows)

  const examRows: Row[] = []
  for (let k = 0; k < Math.round(N * 0.085); k++) {
    const s = students[(k * 613) % students.length]
    const titles = EXAM_TITLES[s.subject] ?? EXAM_TITLES['תגבור']
    const reported = k % 6 === 5
    examRows.push({
      id: uid(T.exam, k), organization_id: ORG_ID, student_id: sid(s.idx), subject: s.subject, title: pick(rp, titles),
      exam_date: now.plus({ days: reported ? between(rp, 2, 21) : -between(rp, 3, 70) }).toISODate(),
      score: reported ? null : between(rp, 55, 100), max_score: 100, status: reported ? 'reported' : 'scored',
      source: reported ? 'parent' : 'staff', created_by: reported ? null : ownerId, reported_by_parent_id: reported ? pid(s.family) : null,
    })
  }
  await upsertChunks(db, 'student_exams', examRows)
  console.log(`  ✓ ${hwRows.length} שיעורי בית (${subRowsHw.length} הגשות מדורגות), ${noteRows.length} הערות שיעור, ${goalRows.length} יעדים, ${examRows.length} מבחנים`)

  // ── 9. Billing through the real engine ──────────────────────────────────────
  console.log('\n▸ חיובים (מנוע החיוב האמיתי, ללא ספק חיצוני)')
  const rb = rng(N * 5 + 1)
  const months = Array.from({ length: BILLING_MONTHS }, (_, i) => now.minus({ months: BILLING_MONTHS - 1 - i }).toFormat('yyyy-MM'))
  const familyOf = new Map(students.map((s) => [sid(s.idx), s.family]))
  let chargesCreated = 0, paymentsCreated = 0
  for (const [mi, month] of months.entries()) {
    if (DRY) break
    const t0 = Date.now()
    const result = await buildMonthForAllStudents(ORG_ID, month, TZ, 1, 7)
    type Billing = { id: string; student_id: string; parent_id: string | null; total_amount: number | string; period_start: string; period_end: string; is_approved: boolean; is_paid: boolean }
    const billing = await fetchAll<Billing>(db, 'student_monthly_billing', 'id, student_id, parent_id, total_amount, period_start, period_end, is_approved, is_paid', (q) => q.eq('organization_id', ORG_ID).eq('billing_month', month))
    const existingCharges = new Set((await fetchAll<{ billing_record_id: string }>(db, 'charges', 'billing_record_id', (q) => q.eq('organization_id', ORG_ID).eq('billing_month', month).eq('charge_type', 'monthly'))).map((c) => c.billing_record_id))

    // Approve everything (the UI's "approve month" step), then write the ledger rows the way syncMonthlyCharge does.
    const toApprove = billing.filter((b) => !b.is_approved).map((b) => b.id)
    for (const ids of chunk(toApprove, 300)) await expectOk('approve billing', db.from('student_monthly_billing').update({ is_approved: true }).in('id', ids))

    const isCurrent = mi === months.length - 1
    const periodEnd = billing[0]?.period_end ?? now.startOf('month').endOf('month').toISODate()!
    const createdAt = isCurrent ? now.startOf('month').plus({ days: 2, hours: 9 }) : DateTime.fromISO(periodEnd, { zone: TZ }).plus({ days: 1, hours: 10 })
    const chargeRows: Row[] = []
    const paidIds: string[] = []
    const payRows: Array<{ billingId: string; parentId: string; amount: number; paidAt: string; method: string }> = []
    for (const b of billing) {
      const amount = Number(b.total_amount)
      if (!b.parent_id || amount <= 0 || existingCharges.has(b.id)) continue
      const fam = familyOf.get(b.student_id) ?? 0
      const paid = rng(fam * 1000 + mi * 7 + 3)() < PAID_RATE[mi]
      const paidAt = paid
        ? (isCurrent ? now.startOf('month').plus({ days: between(rb, 1, Math.max(1, now.day - 1)), hours: between(rb, 8, 20) }) : createdAt.plus({ days: between(rb, 0, 18), hours: between(rb, 0, 10) }))
        : null
      chargeRows.push({
        organization_id: ORG_ID, parent_id: b.parent_id, student_id: b.student_id, billing_record_id: b.id, billing_month: month, amount,
        charge_type: 'monthly', status: paid ? 'paid' : 'pending', notes: monthlyChargeNote(month),
        paid_at: paidAt?.toUTC().toISO() ?? null, amount_paid: paid ? amount : 0,
        due_date: resolveChargeDueDate({ chargeType: 'monthly', issuedAt: new Date(), billingMonth: month, periodEnd: b.period_end, dueDays: 7, timezone: 'UTC' }),
        created_at: createdAt.toUTC().toISO(), updated_at: (paidAt ?? createdAt).toUTC().toISO(),
      })
      if (paid && paidAt) { paidIds.push(b.id); payRows.push({ billingId: b.id, parentId: b.parent_id, amount, paidAt: paidAt.toUTC().toISO()!, method: pick(rb, ['bank_transfer', 'bank_transfer', 'cash', 'provider', 'manual']) }) }
    }
    for (const part of chunk(chargeRows, 300)) {
      const { error } = await db.from('charges').insert(part)
      if (error) fail(`insert charges ${month}: ${error.message}`)
    }
    chargesCreated += chargeRows.length
    for (const ids of chunk(paidIds, 300)) await expectOk('mark billing paid', db.from('student_monthly_billing').update({ is_paid: true }).in('id', ids))
    if (payRows.length > 0) {
      const charges = await fetchAll<{ id: string; billing_record_id: string }>(db, 'charges', 'id, billing_record_id', (q) => q.eq('organization_id', ORG_ID).eq('billing_month', month).eq('charge_type', 'monthly').eq('status', 'paid'))
      const chargeByBilling = new Map(charges.map((c) => [c.billing_record_id, c.id]))
      const cpRows = payRows.filter((p) => chargeByBilling.has(p.billingId)).map((p) => ({
        organization_id: ORG_ID, charge_id: chargeByBilling.get(p.billingId), parent_id: p.parentId, amount: p.amount, method: p.method, paid_at: p.paidAt, created_at: p.paidAt,
      }))
      for (const part of chunk(cpRows, 300)) {
        const { error } = await db.from('charge_payments').insert(part)
        if (error) fail(`insert charge_payments ${month}: ${error.message}`)
      }
      paymentsCreated += cpRows.length
    }
    console.log(`  ${month}: ${result.success.length} נבנו, ${result.skipped.length} דולגו, ${result.errors.length} שגיאות → ${chargeRows.length} חיובים, ${payRows.length} שולמו (${Math.round((Date.now() - t0) / 1000)}s)`)
    if (result.errors.length > 0) console.warn('   ', JSON.stringify(result.errors.slice(0, 3)))
  }

  // Manual charges, a couple of waived ones and one refund — the edge cases the debt screens show.
  const MANUAL = ['ערכת חוברות מתמטיקה', 'מבחן מתכונת — חומרים', 'ספר לימוד אנגלית', 'סדנת אסטרטגיות — יום מרוכז', 'שיעור ניסיון']
  const manualRows: Row[] = []
  for (let k = 0; k < 20; k++) {
    const s = students[(k * 97) % students.length]
    const paid = rb() < 0.5
    const created = now.minus({ days: between(rb, 3, 45) })
    manualRows.push({
      id: uid(T.manualCharge, k), organization_id: ORG_ID, parent_id: pid(s.family), student_id: sid(s.idx), amount: between(rb, 6, 35) * 10,
      charge_type: 'manual', status: paid ? 'paid' : 'pending', notes: pick(rb, MANUAL), due_date: created.plus({ days: 14 }).toISODate(),
      paid_at: paid ? created.plus({ days: 3 }).toUTC().toISO() : null, amount_paid: 0, created_at: created.toUTC().toISO(),
    })
  }
  await upsertChunks(db, 'charges', manualRows)
  const openMonthly = await fetchAll<{ id: string; amount: number }>(db, 'charges', 'id, amount', (q) => q.eq('organization_id', ORG_ID).eq('charge_type', 'monthly').eq('status', 'pending').order('id').limit(3))
  for (const [k, c] of openMonthly.slice(0, 2).entries()) {
    await expectOk('waive', db.from('charges').update({ status: 'waived', resolved_at: now.minus({ days: 4 + k }).toUTC().toISO(), resolved_by_profile_id: ownerId, resolution_reason: k === 0 ? 'הנחה חד-פעמית — סיכום עם ההורה' : 'שיעורים לא התקיימו בפועל' }).eq('id', c.id))
  }
  const paidOne = await fetchAll<{ id: string; amount: number }>(db, 'charges', 'id, amount', (q) => q.eq('organization_id', ORG_ID).eq('charge_type', 'monthly').eq('status', 'paid').is('refunded_at', null).order('id').limit(1))
  if (paidOne[0]) {
    await expectOk('refund', db.from('charges').update({ refunded_at: now.minus({ days: 6 }).toUTC().toISO(), refunded_amount: Math.min(200, Number(paidOne[0].amount)), refund_reason: 'שיעור שחויב בטעות', refunded_by_profile_id: ownerId }).eq('id', paidOne[0].id))
  }
  console.log(`  ✓ ${chargesCreated} חיובים חודשיים, ${paymentsCreated} תשלומים, ${manualRows.length} חיובים ידניים, 2 ויתורים, 1 החזר`)

  // ── 10. WhatsApp — local rows only ──────────────────────────────────────────
  console.log('\n▸ וואטסאפ (שורות מקומיות בלבד, אין שליחה)')
  const rw = rng(N + 42)
  const teacherName = (t: number | null) => (t != null ? STAFF[t].name : 'המורה')
  const kidsOf = (f: number) => families[f].kids.map((k) => students[k])
  const firstName = (s: Student) => s.name.split(' ')[0]
  type Msg = { phone: string; dir: 'in' | 'out'; origin?: 'bot' | 'ai' | 'staff' | 'cron'; kind?: string; body: string; at: DateTime; role?: 'parent' | 'unknown'; window?: boolean; staff?: boolean }
  const msgs: Msg[] = []
  const h = (n: number) => now.minus({ hours: n })
  const d = (n: number) => now.minus({ days: n })

  // Scenario families 1..5 (family 0 is the verified live-demo parent, kept clean).
  const fam = (i: number) => families[i]
  const kid = (i: number, n = 0) => kidsOf(i)[n] ?? kidsOf(i)[0]
  const nextDayName = (day: number) => ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'][day] ?? 'חמישי'
  {
    // 1. "נועה לא תוכל להגיע מחר, אפשר להעביר לחמישי?"
    const f = fam(1), k = kid(1)
    const sr = series.find((x) => x.students.includes(k.idx))
    msgs.push({ phone: f.phone, dir: 'out', origin: 'cron', kind: 'template', body: `תזכורת: ל${firstName(k)} יש שיעור ${k.subject} מחר ב-${sr ? String(sr.hour).padStart(2, '0') : '17'}:00 עם ${teacherName(k.teacher)}.`, at: h(22) })
    msgs.push({ phone: f.phone, dir: 'in', body: `${firstName(k)} לא תוכל להגיע מחר, אפשר להעביר לחמישי?`, at: h(3), window: true })
    msgs.push({ phone: f.phone, dir: 'out', origin: 'bot', kind: 'interactive', body: `מצאתי את השיעור של ${firstName(k)} מחר עם ${teacherName(k.teacher)}. יש מקום ביום חמישי ב-17:00 — להעביר?`, at: h(3) })
    msgs.push({ phone: f.phone, dir: 'in', body: 'כן, תודה!', at: h(2.9), window: true })
    msgs.push({ phone: f.phone, dir: 'out', origin: 'bot', body: `הועבר ✅ השיעור של ${firstName(k)} נקבע ליום חמישי ב-17:00 עם ${teacherName(k.teacher)}. נשלחה תזכורת מעודכנת.`, at: h(2.9) })
  }
  {
    // 2. "אני רוצה לבטל את השיעור של היום" — late cancellation, staff took over.
    const f = fam(2), k = kid(2)
    msgs.push({ phone: f.phone, dir: 'in', body: 'אני רוצה לבטל את השיעור של היום', at: h(4), window: true })
    msgs.push({ phone: f.phone, dir: 'out', origin: 'bot', kind: 'interactive', body: `השיעור של ${firstName(k)} היום ב-17:00 עם ${teacherName(k.teacher)}. ביטול פחות מ-24 שעות מראש כרוך בחיוב של 50% לפי מדיניות המרכז. לאשר ביטול?`, at: h(4) })
    msgs.push({ phone: f.phone, dir: 'in', body: 'רגע, יש אפשרות בלי חיוב? הילד חולה', at: h(3.8), window: true })
    msgs.push({ phone: f.phone, dir: 'out', origin: 'staff', body: `היי ${f.parentName.split(' ')[0]}, שרון מהמזכירות. במקרה של מחלה אנחנו לא מחייבים — ביטלתי בלי חיוב. רפואה שלמה!`, at: h(3.5), staff: true })
    msgs.push({ phone: f.phone, dir: 'in', body: 'תודה רבה!! 🙏', at: h(3.4), window: true })
  }
  {
    // 3. "יש מקום לעוד שיעור השבוע?"
    const f = fam(3), k = kid(3)
    msgs.push({ phone: f.phone, dir: 'in', body: 'יש מקום לעוד שיעור השבוע?', at: h(1.5), window: true })
    msgs.push({ phone: f.phone, dir: 'out', origin: 'bot', kind: 'interactive', body: `ל${teacherName(k.teacher)} יש מקום השבוע: יום ${nextDayName((now.weekday + 1) % 5)} 18:00 או יום חמישי 16:00. איזה מתאים?`, at: h(1.5) })
  }
  {
    // 4. "לא קיבלתי עדיין קבלה"
    const f = fam(4), k = kid(4)
    msgs.push({ phone: f.phone, dir: 'out', origin: 'cron', kind: 'template', body: `שלום ${f.parentName.split(' ')[0]}, חשבון ${now.minus({ months: 1 }).setLocale('he').toFormat('MMMM')} של ${firstName(k)} התקבל. תודה!`, at: d(6) })
    msgs.push({ phone: f.phone, dir: 'in', body: 'לא קיבלתי עדיין קבלה', at: d(1).minus({ hours: 2 }) })
    msgs.push({ phone: f.phone, dir: 'out', origin: 'ai', body: 'בדקתי — התשלום נקלט ב-' + d(6).toFormat('dd/MM') + '. הקבלה מופקת במערכת החשבוניות של המרכז ותישלח אליך היום. אם לא תגיע עד הערב, כתבי לי שוב.', at: d(1).minus({ hours: 1.9 }) })
    msgs.push({ phone: f.phone, dir: 'in', body: 'מעולה תודה', at: d(1).minus({ hours: 1.5 }) })
  }
  {
    // 5. "אפשר להעביר את יואב לקבוצה של יום רביעי?"
    const f = fam(5), k = kid(5)
    msgs.push({ phone: f.phone, dir: 'in', body: `אפשר להעביר את ${firstName(k)} לקבוצה של יום רביעי?`, at: h(0.7), window: true })
    msgs.push({ phone: f.phone, dir: 'out', origin: 'bot', body: `קיבלתי. העברת קבוצה דורשת אישור של המרכז — הודעתי לרונית והיא תחזור אליך היום. בינתיים ${firstName(k)} נשאר/ת בקבוצה הנוכחית.`, at: h(0.7) })
  }
  // The verified family: a clean thread, so the live demo starts fresh.
  msgs.push({ phone: VERIFIED_PARENT_PHONE, dir: 'out', origin: 'cron', kind: 'template', body: `תזכורת: לנועה יש שיעור אנגלית מחר עם ${STAFF[noaSeries.teacher].name}.`, at: d(14) })
  msgs.push({ phone: VERIFIED_PARENT_PHONE, dir: 'in', body: 'תודה!', at: d(14).plus({ hours: 1 }) })
  // Background threads.
  const bgTexts: Array<[string, string]> = [
    ['מתי השיעור הבא?', 'השיעור הבא: יום {day} ב-{hour}:00 עם {teacher}. נתראה!'],
    ['תודה על השיעור, {kid} יצא/ה מרוצה', 'איזה כיף לשמוע! מסרתי ל{teacher} 😊'],
    ['אפשר לקבל את פירוט החשבון של החודש?', 'בטח. פירוט החשבון: {n} שיעורים, סה"כ ₪{amount}. לתשלום דרך הפורטל.'],
    ['{kid} חולה, לא יגיע היום', 'רפואה שלמה! ביטלתי את השיעור של היום בלי חיוב.'],
    ['יש שיעור בחול המועד?', 'בחול המועד המרכז סגור. השיעורים חוזרים לפי הלו"ז הרגיל אחרי החג.'],
    ['שילמתי היום בהעברה', 'תודה! התשלום ייקלט תוך יום עסקים ותקבל/י אישור.'],
  ]
  for (let i = 6; i < Math.min(families.length, 30); i++) {
    const f = fam(i), k = kid(i)
    const sr = series.find((x) => x.students.includes(k.idx))
    const [q, a] = pick(rw, bgTexts)
    const fill = (s: string) => s.replace('{kid}', firstName(k)).replace('{teacher}', teacherName(k.teacher)).replace('{day}', nextDayName(sr?.day ?? 0)).replace('{hour}', String(sr?.hour ?? 17).padStart(2, '0')).replace('{n}', String(between(rw, 3, 8))).replace('{amount}', String(between(rw, 48, 120) * 10))
    const at = d(between(rw, 1, 40)).minus({ hours: between(rw, 0, 12) })
    msgs.push({ phone: f.phone, dir: 'out', origin: 'cron', kind: 'template', body: `תזכורת: ל${firstName(k)} יש שיעור ${k.subject} מחר עם ${teacherName(k.teacher)}.`, at: at.minus({ days: 1 }) })
    msgs.push({ phone: f.phone, dir: 'in', body: fill(q), at })
    msgs.push({ phone: f.phone, dir: 'out', origin: rw() < 0.5 ? 'bot' : 'ai', body: fill(a), at: at.plus({ minutes: 1 }) })
  }
  // Leads: strangers the bot could not place.
  const leadRows: Row[] = []
  for (const [k, text] of LEAD_MESSAGES.entries()) {
    const phone = `+972521${String(700100 + k)}`
    const at = d(k * 2 + 1).minus({ hours: 5 })
    leadRows.push({ id: uid(T.lead, k), organization_id: ORG_ID, phone, raw_message: text, status: k < 3 ? 'new' : k < 5 ? 'contacted' : 'converted', created_at: at.toUTC().toISO() })
    msgs.push({ phone, dir: 'in', body: text, at, role: 'unknown' })
    msgs.push({ phone, dir: 'out', origin: 'bot', body: 'שלום! תודה על הפנייה למרכז אופק 😊 נציג/ה מהמזכירות יחזרו אליך היום.', at: at.plus({ minutes: 1 }) })
  }
  await upsertChunks(db, 'leads', leadRows)

  const phoneToParent = new Map(families.map((f) => [f.phone, pid(f.idx)]))
  const staffProfile = profileIdOf[STAFF.findIndex((s) => s.role === 'admin')]
  const waRows = msgs.map((m, i) => ({
    id: uid(T.waMessage, i), organization_id: ORG_ID, phone: m.phone, direction: m.dir,
    origin: m.dir === 'out' ? (m.origin ?? 'bot') : null, parent_id: phoneToParent.get(m.phone) ?? null,
    sender_role: m.dir === 'in' ? (m.role ?? 'parent') : null, sent_by_profile_id: m.staff ? staffProfile : null,
    kind: m.kind ?? 'text', body: m.body, wa_message_id: `demo-${String(i).padStart(4, '0')}`,
    status: m.dir === 'in' ? 'received' : m.at < now.minus({ hours: 1 }) ? 'read' : 'delivered', created_at: m.at.toUTC().toISO(),
  }))
  await upsertChunks(db, 'whatsapp_messages', waRows)
  const processed = msgs.map((m, i) => ({ m, i })).filter(({ m }) => m.dir === 'in' && m.window).map(({ m, i }) => ({ organization_id: ORG_ID, message_id: `demo-in-${i}`, phone: m.phone, created_at: m.at.toUTC().toISO() }))
  await upsertChunks(db, 'whatsapp_processed_messages', processed, 'organization_id,message_id')
  await upsertChunks(db, 'whatsapp_takeovers', [{ id: uid(T.takeover, 0), organization_id: ORG_ID, phone: fam(2).phone, taken_by_profile_id: staffProfile, expires_at: now.plus({ hours: 6 }).toUTC().toISO() }], 'organization_id,phone')
  console.log(`  ✓ ${waRows.length} הודעות ב-${new Set(msgs.map((m) => m.phone)).size} שיחות, ${processed.length} בחלון 24ש', ${leadRows.length} לידים, 1 השתלטות`)

  // ── 11. Verify integration columns untouched ────────────────────────────────
  if (!DRY) {
    const { wa: waAfter } = await assertOrg(db)
    assertWaUnchanged(waBefore, waAfter)
  }

  console.log(
    '\n' + '─'.repeat(70) +
    `\n"${NEW_ORG_NAME}" — ${students.length} תלמידים, ${families.length} משפחות, ${STAFF.length} אנשי צוות, ${groups.length} קבוצות, ${lessonRows.length} שיעורים` +
    '\n\nכניסה\n' +
    '  URL:      https://www.getlessio.com/login\n' +
    `  Email:    ${OWNER_EMAIL}\n` +
    `  Password: ${password}\n` +
    `  צוות:     ofek.staff01…${String(STAFF.length).padStart(2, '0')}@${STAFF_EMAIL_DOMAIN} (אותה סיסמה)\n` +
    `  הורה חי:  יעל לוי ${VERIFIED_PARENT_PHONE} — נועה לוי (אנגלית, ${STAFF[noaSeries.teacher].name}) + יואב לוי (${groups[0].name})\n` +
    '\n✓ עמודות האינטגרציה של הארגון לא השתנו.\n' + '─'.repeat(70)
  )
}

function ered(k: number): number { return 1 + ((k * 37) % 11) }

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
