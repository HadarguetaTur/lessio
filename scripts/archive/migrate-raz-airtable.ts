/**
 * One-off production migration: import רז מזוריק's historical data from his
 * Airtable base ("רז מזוריק- ניהול נתונים") into his existing Lessio org.
 *
 * Reads raw Airtable JSON extracts (produced ahead of time, NOT committed to the
 * repo — customer data) from --data-dir, transforms them and upserts into prod
 * via the service-role client. Also, as agreed:
 *   - upgrades the org's SaaS subscription to `advanced` for 3 months
 *     (the free trial expired and left the org read_only), and
 *   - creates a platform superadmin for hadart20@gmail.com.
 *
 * Safe to re-run: every imported row lives under a deterministic UUID with the
 * recognizable a1000000- prefix (bands: 01 teachers, 02 parents, 03 students,
 * 04 lessons, 05 subscriptions, 06 groups, 07 homework, 08 cancellation events,
 * 09 monthly billing) and every write is an upsert. Transactional history is
 * imported as-is; the monthly billing engine is deliberately NOT re-run over
 * past months so the historical amounts stay exactly as Airtable recorded them.
 *
 * Usage:
 *   npx tsx scripts/migrate-raz-airtable.ts --data-dir <dir> --dry-run   # report only
 *   npx tsx scripts/migrate-raz-airtable.ts --data-dir <dir> --yes       # execute
 *
 * Env (falling back to .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { randomBytes } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'

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

loadEnvLocal()

import { normalizePhone } from '../../src/lib/phone'

// ── Fixed identity ────────────────────────────────────────────────────────────

const ORG_ID = '9c3c2b2a-1640-4f7e-a102-3e130e8660c2'
const EXPECTED_ORG_NAME = 'רז מזוריק'
const TIMEZONE = 'Asia/Jerusalem'

/** Raz's existing teacher + profile rows (owner of the org). */
const RAZ_TEACHER_ID = '41eb53af-c36b-41ad-88ef-9719966093df'
const RAZ_PROFILE_ID = '937eb93a-15f3-46f5-80ce-def7aef350a9'
/** Airtable rec id of Raz's row in the מורים table. */
const RAZ_AIRTABLE_TEACHER_REC = 'recJ6v8A956sJe9xl'

const ADVANCED_PLAN_ID = '64ca56fe-9a9d-4d75-9091-4262693a7341'
const ORG_SUBSCRIPTION_ROW_ID = '2c4f880f-fc0c-4c34-acc2-958c343f9b93'

const SUPERADMIN_EMAIL = 'hadart20@gmail.com'
const YUVAL_PLACEHOLDER_EMAIL = 'raz-teacher-yuval@getlessio.com'

const DEFAULT_HOURLY_RATE = 150

// Deterministic UUIDs: a1000000-0000-4000-8000-<band(2)><seq(10)>
const uid = (band: string, seq: number): string =>
  `a1000000-0000-4000-8000-${band}${String(seq).padStart(10, '0')}`

// ── Airtable field ids ────────────────────────────────────────────────────────

const F = {
  student: {
    name: 'fldNJFqByVsu71fbP',
    phone: 'fldu5Zi7NycCc5Y2Q',
    parentPhone: 'fldYWmaWJ1b4pLTrF',
    parentName: 'fldSI6SKV95eQBMcz',
    grade: 'fldbEdhUA88Ki6pmE',
    level: 'fldSgoTDjxgji9DR3',
    subjects: 'fld2Z3zDM8JbeZcoz',
    weeklyLimit: 'fld8cHmf8iwecwIgR',
    isActive: 'fldawVg46sWMDwKG2',
  },
  teacher: {
    name: 'fldikjRyN51ep0o6r',
    phone: 'fldFxbOLBPLrefdUc',
    email: 'fldXBElbPEBhpTTQJ',
    rate: 'fldeGClYrEMFZWNTm',
    isActive: 'fldk8b5uuXGMT0Orp',
  },
  lesson: {
    autoId: 'fldzVtKPAiAv7XDXm',
    studentLinks: 'fldZQ1FA7rSpeJPAD',
    status: 'fldPONP7KmcPoakha',
    date: 'flds2eurlImNHzHGY',
    start: 'fldzQayqbCyHMl6m6',
    end: 'fldkqA8KYTgkUpaPn',
    duration: 'fldO1OgzXJ4DfIxXc',
    type: 'fldniv3h2YrbA1p2V',
    price: 'fldCBDnBROgEFVwOc',
    teacherLinks: 'fldakZKM2trfGwyae',
    cancelReason: 'fldJmQcnnHOcQiqXQ',
  },
  cancellation: {
    lessonLinks: 'fldGpgIcvnGGd6v4g',
    studentLinks: 'fldsI7dN9PZc9r03z',
    date: 'fldCksk6PYOsEbXhG',
    hoursBefore: 'fld3t3XIoYRT8VdXz',
    isLt24h: 'fldwdKqvsO3zeEEG3',
    isCharged: 'fldY8UpL18ptPcyuP',
    charge: 'fldp3DC7QUGaFM9Qp',
    billingMonth: 'fld2SrPcmena62JTm',
    createdAt: 'fldpZzC91hR6eymb9',
  },
  subscription: {
    studentLinks: 'fldtQ15Oof5J6biHI',
    start: 'fldtsMOdATNiCDG9J',
    end: 'fldCwVs023E0CXQte',
    amount: 'fldGLeawRr28jFUfY',
    type: 'fldZEFyRvRmoGW2Gp',
    pause: 'fld1HlosuUHpHtChm',
    pauseDate: 'fldAS7JN97ukS0RJy',
  },
  charge: {
    studentLinks: 'fldc8sodkbiEpWNhQ',
    month: 'fldWdN2eDmRaeTAKL',
    paid: 'fldfVAAF9AEnt0CN1',
    approved: 'fldzuGfdSuHuL4W4o',
    adjAmount: 'fldEUBI5Xp4qfcQeA',
    adjReason: 'fld2hQ79kxcQTjmVb',
    adjDate: 'fldzN3y1uKFVoScwP',
    lessonsAmt: 'fld1X4cS6NfXk8MkC',
    subsAmt: 'fldReg9Mh8BeUHgea',
    cancelAmt: 'fldEMFKABOIQOtwtX',
    totalAmt: 'fldI749R0ZED4ZPoW',
    lessonsCount: 'fldeLoEi5r6lrvPY7',
  },
  group: {
    name: 'fldxmgcUV6glMV3K9',
    studentLinks: 'fldMG0TxARJwKfdXN',
    status: 'fldG4gEMrOUcu67Qa',
  },
  homework: {
    topic: 'fld74PYXaCjMJzras',
    subtitle: 'fldBPaVig90GMnXgX',
    desc: 'fldRsUZJy2eXP9X3q',
    level: 'fldU5BLMrymACHmeZ',
    classGrade: 'fldlKz9wEfXI9njTs',
  },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

type AirtableRecord = {
  id: string
  createdTime?: string
  cellValuesByFieldId: Record<string, unknown>
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

async function expectOk(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p
  if (error) fail(`${label}: ${error.message}`)
}

function loadTable(dataDir: string, file: string): AirtableRecord[] {
  const path = join(dataDir, file)
  if (!existsSync(path)) fail(`Missing extract file: ${path}`)
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  return parsed.records as AirtableRecord[]
}

const cell = (r: AirtableRecord, fieldId: string): unknown => r.cellValuesByFieldId[fieldId]

/** Select-cell → trimmed option name ("בוצע " and "בוצע" are the same option). */
function selectName(v: unknown): string | null {
  if (v && typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    return String((v as { name: string }).name).trim()
  }
  return null
}

function linkedIds(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((l) => (l as { id: string }).id).filter(Boolean)
}

function cleanName(v: unknown): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tryNormalizePhone(raw: unknown): string | null {
  const s = String(raw ?? '')
    // strip invisible RTL/LTR marks that Airtable phone cells sometimes carry
    .replace(/[‎‏‪-‮]/g, '')
    .trim()
  if (!s) return null
  try {
    return normalizePhone(s)
  } catch {
    return null
  }
}

const looksLikePhone = (s: string): boolean => /^[\d\s()+.-]{7,}$/.test(s.trim())

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

/** Create-or-adopt an auth user; existing users keep their password. */
async function ensureAuthUser(
  db: SupabaseClient,
  email: string,
  fullName: string
): Promise<{ id: string; created: boolean; password: string | null }> {
  const existing = await findUserByEmail(db, email)
  if (existing) return { id: existing, created: false, password: null }

  const password = randomBytes(18).toString('base64url')
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data?.user) fail(`Failed to create auth user ${email}: ${error?.message}`)
  return { id: data.user.id, created: true, password }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const confirmed = args.includes('--yes')
  const dataDirIdx = args.indexOf('--data-dir')
  const dataDir = dataDirIdx !== -1 ? args[dataDirIdx + 1] : ''
  if (!dataDir) fail('Pass --data-dir <dir with the Airtable JSON extracts>')
  if (!dryRun && !confirmed) fail('Refusing to write without --yes (or use --dry-run)')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // Guardrail: never touch any org but Raz's.
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id, name, timezone')
    .eq('id', ORG_ID)
    .single()
  if (orgErr || !org) fail(`Target org not found: ${orgErr?.message}`)
  if (org.name !== EXPECTED_ORG_NAME) {
    fail(`Org ${ORG_ID} is named "${org.name}", expected "${EXPECTED_ORG_NAME}" — aborting`)
  }

  const report: Record<string, unknown> = {}
  const exceptions: string[] = []

  // ── Load extracts ───────────────────────────────────────────────────────────
  const studentsRaw = loadTable(dataDir, 'students.json')
  const teachersRaw = loadTable(dataDir, 'teachers.json')
  const lessonsRaw = loadTable(dataDir, 'lessons.json')
  const cancellationsRaw = loadTable(dataDir, 'cancellations.json')
  const subscriptionsRaw = loadTable(dataDir, 'subscriptions.json')
  const chargesRaw = loadTable(dataDir, 'charges.json')
  const groupsRaw = loadTable(dataDir, 'groups.json')
  const homeworkRaw = loadTable(dataDir, 'homework.json')

  // ── 1. Students: dedupe by normalized phone, merge duplicates ───────────────

  type StudentDraft = {
    recIds: string[]
    id: string
    full_name: string
    phone: string | null
    rawPhone: string
    grade: string | null
    level: string | null
    focused_subject: string | null
    weekly_quota: number | null
    status: 'active' | 'inactive'
    parentName: string | null
    parentPhoneRaw: string | null
    filled: number
  }

  const byKey = new Map<string, StudentDraft[]>()
  for (const r of studentsRaw) {
    let parentName = cleanName(cell(r, F.student.parentName)) || null
    let parentPhoneRaw = String(cell(r, F.student.parentPhone) ?? '').trim() || null
    // One record has the parent name and phone swapped — detect and fix.
    if (parentName && looksLikePhone(parentName) && parentPhoneRaw && !looksLikePhone(parentPhoneRaw)) {
      ;[parentName, parentPhoneRaw] = [parentPhoneRaw, parentName]
      exceptions.push(`student ${r.id}: parent name/phone were swapped in Airtable — fixed`)
    }

    const rawPhone = String(cell(r, F.student.phone) ?? '').trim()
    const phone = tryNormalizePhone(rawPhone)
    const subjects = Array.isArray(cell(r, F.student.subjects))
      ? (cell(r, F.student.subjects) as { name: string }[]).map((s) => s.name.trim()).join(', ')
      : null

    const draft: StudentDraft = {
      recIds: [r.id],
      id: '',
      full_name: cleanName(cell(r, F.student.name)),
      phone,
      rawPhone,
      grade: selectName(cell(r, F.student.grade)),
      level: selectName(cell(r, F.student.level)),
      focused_subject: subjects || null,
      weekly_quota: typeof cell(r, F.student.weeklyLimit) === 'number' ? (cell(r, F.student.weeklyLimit) as number) : null,
      status: cell(r, F.student.isActive) ? 'active' : 'inactive',
      parentName,
      parentPhoneRaw,
      filled: Object.keys(r.cellValuesByFieldId).length,
    }
    if (!draft.full_name) {
      exceptions.push(`student ${r.id}: empty name — skipped`)
      continue
    }
    if (rawPhone && !phone) {
      exceptions.push(`student "${draft.full_name}" (${r.id}): invalid phone "${rawPhone}" — stored without phone`)
    }
    // Siblings sometimes share one phone in Airtable, so phone alone over-merges
    // (e.g. גלעד+עמרי אורבך). Merge only when the first name matches too.
    const firstName = draft.full_name.split(' ')[0]
    const key = phone ? `phone:${phone}:${firstName}` : `name:${draft.full_name}`
    const list = byKey.get(key) ?? []
    list.push(draft)
    byKey.set(key, list)
  }

  const students: StudentDraft[] = []
  const recToStudentId = new Map<string, string>()
  const merges: string[] = []
  let studentSeq = 0
  for (const [, list] of byKey) {
    // Keep the richest record; union the rec ids so every Airtable link resolves.
    list.sort((a, b) => b.filled - a.filled)
    const canonical = list[0]
    for (const dup of list.slice(1)) {
      canonical.recIds.push(...dup.recIds)
      canonical.parentName ||= dup.parentName
      canonical.parentPhoneRaw ||= dup.parentPhoneRaw
      canonical.grade ||= dup.grade
      canonical.level ||= dup.level
      canonical.focused_subject ||= dup.focused_subject
      merges.push(`"${dup.full_name}" merged into "${canonical.full_name}" (${canonical.phone ?? 'no phone'})`)
    }
    canonical.id = uid('03', ++studentSeq)
    for (const rec of canonical.recIds) recToStudentId.set(rec, canonical.id)
    students.push(canonical)
  }
  report.students = { source: studentsRaw.length, imported: students.length, merges }

  // ── 2. Parents: dedupe by normalized phone across students ──────────────────

  type ParentDraft = { id: string; full_name: string; phone: string; studentIds: string[] }
  const parentsByPhone = new Map<string, ParentDraft>()
  const studentsWithoutParent: string[] = []
  let parentSeq = 0
  for (const s of students) {
    const parentPhone = tryNormalizePhone(s.parentPhoneRaw)
    if (!parentPhone) {
      studentsWithoutParent.push(`${s.full_name}${s.parentPhoneRaw ? ` (טלפון לא תקין: "${s.parentPhoneRaw}")` : ''}`)
      continue
    }
    let p = parentsByPhone.get(parentPhone)
    if (!p) {
      p = {
        id: uid('02', ++parentSeq),
        full_name: s.parentName || `הורה של ${s.full_name}`,
        phone: parentPhone,
        studentIds: [],
      }
      parentsByPhone.set(parentPhone, p)
    } else if (s.parentName && p.full_name.startsWith('הורה של')) {
      p.full_name = s.parentName
    }
    p.studentIds.push(s.id)
  }
  const parents = [...parentsByPhone.values()]
  report.parents = { imported: parents.length, studentsWithoutParent }

  // ── 3. Teachers ─────────────────────────────────────────────────────────────

  const recToTeacherId = new Map<string, string>()
  recToTeacherId.set(RAZ_AIRTABLE_TEACHER_REC, RAZ_TEACHER_ID)
  const yuvalRec = teachersRaw.find((r) => r.id !== RAZ_AIRTABLE_TEACHER_REC)
  const YUVAL_TEACHER_ID = uid('01', 1)
  if (yuvalRec) recToTeacherId.set(yuvalRec.id, YUVAL_TEACHER_ID)
  report.teachers = {
    raz: `existing ${RAZ_TEACHER_ID}, hourly_rate set to ${DEFAULT_HOURLY_RATE}`,
    yuval: yuvalRec
      ? `new teacher ${YUVAL_TEACHER_ID} with placeholder email ${YUVAL_PLACEHOLDER_EMAIL}`
      : 'not found in extract',
  }

  // ── 4. Lessons ──────────────────────────────────────────────────────────────

  type LessonDraft = {
    id: string
    airtableId: number
    teacher_id: string
    start_at: string
    end_at: string
    status: 'scheduled' | 'completed' | 'cancelled'
    cancel_reason: string | null
    lesson_type: 'individual' | 'pair' | 'group'
    max_students: number
    price_per_student: number | null
    studentIds: string[]
  }

  const now = DateTime.now().setZone(TIMEZONE)
  const lessons: LessonDraft[] = []
  const lessonRecToId = new Map<string, string>()
  let typeCoercions = 0
  let lessonSeq = 0
  const lessonSkips: string[] = []

  for (const r of lessonsRaw) {
    const start = String(cell(r, F.lesson.start) ?? '')
    if (!start) {
      lessonSkips.push(`lesson ${r.id}: no start_datetime`)
      continue
    }
    const startDt = DateTime.fromISO(start)
    const duration = typeof cell(r, F.lesson.duration) === 'number' ? (cell(r, F.lesson.duration) as number) : 60
    const endRaw = String(cell(r, F.lesson.end) ?? '')
    const endDt = endRaw ? DateTime.fromISO(endRaw) : startDt.plus({ minutes: duration })

    const statusName = selectName(cell(r, F.lesson.status)) ?? 'מתוכנן'
    let status: LessonDraft['status']
    if (statusName.startsWith('בוטל')) status = 'cancelled'
    else if (startDt < now.toUTC()) status = 'completed' // history: the old bot never flipped מתוכנן→בוצע
    else status = 'scheduled'

    const studentIds = [
      ...new Set(linkedIds(cell(r, F.lesson.studentLinks)).map((rec) => recToStudentId.get(rec)).filter(Boolean)),
    ] as string[]
    if (studentIds.length === 0) {
      lessonSkips.push(`lesson airtable#${cell(r, F.lesson.autoId)}: no resolvable students`)
      continue
    }

    const typeName = selectName(cell(r, F.lesson.type)) ?? 'פרטי'
    let lesson_type: LessonDraft['lesson_type'] =
      typeName === 'פרטי' ? 'individual' : typeName === 'זוגי' ? 'pair' : 'group' // קבוצתי/מותאם/custom → group
    // The billing engine rejects an individual lesson with >1 students — coerce.
    if (lesson_type === 'individual' && studentIds.length > 1) {
      lesson_type = studentIds.length === 2 ? 'pair' : 'group'
      typeCoercions++
    }

    const price = typeof cell(r, F.lesson.price) === 'number' ? (cell(r, F.lesson.price) as number) : null
    const teacherRec = linkedIds(cell(r, F.lesson.teacherLinks))[0]
    const id = uid('04', ++lessonSeq)
    lessonRecToId.set(r.id, id)
    lessons.push({
      id,
      airtableId: cell(r, F.lesson.autoId) as number,
      teacher_id: (teacherRec && recToTeacherId.get(teacherRec)) || RAZ_TEACHER_ID,
      start_at: startDt.toUTC().toISO()!,
      end_at: endDt.toUTC().toISO()!,
      status,
      cancel_reason: cleanName(cell(r, F.lesson.cancelReason)) || null,
      lesson_type,
      max_students: studentIds.length,
      price_per_student: lesson_type === 'individual' ? null : price,
      studentIds,
    })
  }
  report.lessons = {
    source: lessonsRaw.length,
    prepared: lessons.length,
    skippedAtTransform: lessonSkips,
    individualCoercedToPairOrGroup: typeCoercions,
  }

  // ── 5. Subscriptions ────────────────────────────────────────────────────────

  const subs: Record<string, unknown>[] = []
  const subSkips: string[] = []
  let subSeq = 0
  for (const r of subscriptionsRaw) {
    const studentRec = linkedIds(cell(r, F.subscription.studentLinks))[0]
    const student_id = studentRec ? recToStudentId.get(studentRec) : undefined
    const amount = cell(r, F.subscription.amount)
    if (!student_id) {
      subSkips.push(`subscription airtable#${r.id}: no resolvable student`)
      continue
    }
    if (typeof amount !== 'number') {
      subSkips.push(`subscription of student ${student_id}: no monthly_amount — skipped`)
      continue
    }
    const endRaw = String(cell(r, F.subscription.end) ?? '')
    subs.push({
      id: uid('05', ++subSeq),
      organization_id: ORG_ID,
      student_id,
      subscription_type: selectName(cell(r, F.subscription.type)),
      monthly_amount: amount,
      start_date: String(cell(r, F.subscription.start) ?? '') || null,
      end_date: endRaw && endRaw < '2050-01-01' ? endRaw : null, // 2067 = "no end" sentinel
      is_paused: Boolean(cell(r, F.subscription.pause)),
      pause_date: String(cell(r, F.subscription.pauseDate) ?? '') || null,
    })
  }
  report.subscriptions = { source: subscriptionsRaw.length, imported: subs.length, skipped: subSkips }

  // ── 6. Historical monthly billing (imported as-is, engine NOT re-run) ───────

  const billingByKey = new Map<string, Record<string, unknown>>()
  let billingSeq = 0
  for (const r of chargesRaw) {
    const month = String(cell(r, F.charge.month) ?? '')
    const total = cell(r, F.charge.totalAmt)
    if (!month || typeof total !== 'number') continue // 572 empty scaffold rows in Airtable
    const studentRec = linkedIds(cell(r, F.charge.studentLinks))[0]
    const student_id = studentRec ? recToStudentId.get(studentRec) : undefined
    if (!student_id) {
      exceptions.push(`billing row airtable#${cell(r, 'fldqRYtd3vLYkG6SO')}: no resolvable student — skipped`)
      continue
    }
    const billing_month = month.slice(0, 7)
    const parent = parents.find((p) => p.studentIds.includes(student_id))
    const key = `${student_id}:${billing_month}`
    billingByKey.set(key, {
      id: uid('09', ++billingSeq),
      organization_id: ORG_ID,
      student_id,
      parent_id: parent?.id ?? null,
      billing_month,
      is_paid: Boolean(cell(r, F.charge.paid)),
      is_approved: Boolean(cell(r, F.charge.approved)),
      lessons_amount: (cell(r, F.charge.lessonsAmt) as number) ?? 0,
      subscriptions_amount: (cell(r, F.charge.subsAmt) as number) ?? 0,
      cancellations_amount: (cell(r, F.charge.cancelAmt) as number) ?? 0,
      total_amount: total,
      lessons_count: (cell(r, F.charge.lessonsCount) as number) ?? 0,
      manual_adjustment_amount: (cell(r, F.charge.adjAmount) as number) ?? null,
      manual_adjustment_reason: cleanName(cell(r, F.charge.adjReason)) || null,
      manual_adjustment_date: String(cell(r, F.charge.adjDate) ?? '') || null,
    })
  }
  const billingRows = [...billingByKey.values()]
  report.billing = {
    source: chargesRaw.length,
    realRows: billingRows.length,
    paid: billingRows.filter((b) => b.is_paid).length,
  }

  // ── 7. Cancellation events ──────────────────────────────────────────────────

  const cancelEvents: Record<string, unknown>[] = []
  let ceSeq = 0
  for (const r of cancellationsRaw) {
    const lessonRec = linkedIds(cell(r, F.cancellation.lessonLinks))[0]
    const studentRec = linkedIds(cell(r, F.cancellation.studentLinks))[0]
    const lesson_id = lessonRec ? lessonRecToId.get(lessonRec) : undefined
    const student_id = studentRec ? recToStudentId.get(studentRec) : undefined
    if (!lesson_id || !student_id) {
      exceptions.push(`cancellation ${r.id}: unresolvable lesson/student — skipped`)
      continue
    }
    const hours = typeof cell(r, F.cancellation.hoursBefore) === 'number' ? (cell(r, F.cancellation.hoursBefore) as number) : 0
    cancelEvents.push({
      id: uid('08', ++ceSeq),
      organization_id: ORG_ID,
      lesson_id,
      student_id,
      cancellation_date: String(cell(r, F.cancellation.createdAt) ?? '') || new Date().toISOString(),
      hours_before: hours,
      is_lt_24h: Boolean(cell(r, F.cancellation.isLt24h)) || hours < 24,
      is_charged: Boolean(cell(r, F.cancellation.isCharged)),
      charge_override: (cell(r, F.cancellation.charge) as number) ?? null,
      billing_month: String(cell(r, F.cancellation.billingMonth) ?? '') || null,
    })
  }
  report.cancellationEvents = { imported: cancelEvents.length }

  // ── 8. Groups ───────────────────────────────────────────────────────────────

  const groups: { id: string; name: string; status: string; studentIds: string[] }[] = []
  let groupSeq = 0
  for (const r of groupsRaw) {
    const studentIds = [
      ...new Set(linkedIds(cell(r, F.group.studentLinks)).map((rec) => recToStudentId.get(rec)).filter(Boolean)),
    ] as string[]
    groups.push({
      id: uid('06', ++groupSeq),
      name: cleanName(cell(r, F.group.name)),
      status: selectName(cell(r, F.group.status)) === 'paused' ? 'paused' : 'active',
      studentIds,
    })
  }
  report.groups = { imported: groups.length }

  // ── 9. Homework templates ───────────────────────────────────────────────────

  const homework: Record<string, unknown>[] = []
  let hwSeq = 0
  for (const r of homeworkRaw) {
    const topic = selectName(cell(r, F.homework.topic)) ?? 'שיעורי בית'
    const subtitle = cleanName(cell(r, F.homework.subtitle))
    const level = selectName(cell(r, F.homework.level))
    const grade = selectName(cell(r, F.homework.classGrade))
    const meta = [level ? `רמה: ${level}` : null, grade ? `כיתה: ${grade}` : null].filter(Boolean).join(' | ')
    homework.push({
      id: uid('07', ++hwSeq),
      organization_id: ORG_ID,
      title: subtitle || topic,
      subject: topic,
      body: [String(cell(r, F.homework.desc) ?? '').trim(), meta].filter(Boolean).join('\n\n'),
      created_by: RAZ_PROFILE_ID,
    })
  }
  report.homework = { imported: homework.length, note: 'attachments not migrated (files stay in Airtable)' }

  // ── Dry-run: print + save report, stop here ─────────────────────────────────

  report.exceptions = exceptions
  report.notImported = {
    weekly_slot: '55 slot templates — no Lessio equivalent; future scheduling is managed in Lessio directly',
    other: 'רשימת המתנה, בחינות, Entities, slot_inventory, Slot_Blocks, admin_inbox, system_errors — internal bot ops',
    chargesLedger: 'historical charges ledger rows are not created; the billing engine owns future months',
  }

  const reportPath = join(dataDir, 'migration-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\nReport written to ${reportPath}`)
  console.log(
    `\nPlan: ${students.length} students (${merges.length} merges), ${parents.length} parents, ` +
      `${lessons.length} lessons, ${subs.length} subscriptions, ${billingRows.length} billing months, ` +
      `${cancelEvents.length} cancellation events, ${groups.length} groups, ${homework.length} homework templates`
  )
  if (dryRun) {
    console.log('\n--dry-run: no writes performed.')
    return
  }

  // ── Execute ─────────────────────────────────────────────────────────────────

  console.log('\n▶ Teachers')
  await expectOk(
    'update raz hourly_rate',
    db.from('teachers').update({ hourly_rate: DEFAULT_HOURLY_RATE }).eq('id', RAZ_TEACHER_ID)
  )
  if (yuvalRec) {
    const yuval = await ensureAuthUser(db, YUVAL_PLACEHOLDER_EMAIL, 'יובל פוקס')
    await expectOk(
      'yuval profile',
      db.from('profiles').upsert(
        {
          id: yuval.id,
          organization_id: ORG_ID,
          full_name: 'יובל פוקס',
          phone: tryNormalizePhone(cell(yuvalRec, F.teacher.phone)),
          role: 'teacher',
          is_active: true,
        },
        { onConflict: 'id' }
      )
    )
    await expectOk(
      'yuval teacher',
      db.from('teachers').upsert(
        {
          id: YUVAL_TEACHER_ID,
          organization_id: ORG_ID,
          profile_id: yuval.id,
          hourly_rate: (cell(yuvalRec, F.teacher.rate) as number) ?? DEFAULT_HOURLY_RATE,
          is_active: true,
        },
        { onConflict: 'id' }
      )
    )
    if (yuval.created) {
      console.log(`  + auth user ${YUVAL_PLACEHOLDER_EMAIL} — password: ${yuval.password}`)
      console.log('    (placeholder — replace with his real email when available)')
    }
  }

  console.log('▶ Students')
  for (let i = 0; i < students.length; i += 50) {
    const batch = students.slice(i, i + 50).map((s) => ({
      id: s.id,
      organization_id: ORG_ID,
      full_name: s.full_name,
      phone: s.phone,
      grade: s.grade,
      level: s.level,
      focused_subject: s.focused_subject,
      weekly_quota: s.weekly_quota,
      status: s.status, // is_active is derived by trigger
    }))
    await expectOk(`students batch ${i}`, db.from('students').upsert(batch, { onConflict: 'id' }))
  }

  console.log('▶ Parents + relationships')
  for (const p of parents) {
    // 23505 on (organization_id, phone) → adopt the existing row (idempotent re-runs).
    const { error } = await db.from('parents').upsert(
      {
        id: p.id,
        organization_id: ORG_ID,
        full_name: p.full_name,
        phone: p.phone,
        consent_source: 'import',
        consented_at: new Date().toISOString(),
        consented_by: RAZ_PROFILE_ID,
      },
      { onConflict: 'id' }
    )
    let parentId = p.id
    if (error) {
      const { data: existing } = await db
        .from('parents')
        .select('id')
        .eq('organization_id', ORG_ID)
        .eq('phone', p.phone)
        .maybeSingle()
      if (!existing) fail(`parent ${p.full_name}: ${error.message}`)
      parentId = existing.id
    }
    for (const student_id of p.studentIds) {
      await expectOk(
        `relationship ${p.full_name}→${student_id}`,
        db
          .from('relationships')
          .upsert(
            { organization_id: ORG_ID, parent_id: parentId, student_id, is_primary: true },
            { onConflict: 'parent_id,student_id' }
          )
      )
    }
  }

  console.log('▶ Groups')
  for (const g of groups) {
    await expectOk(
      `group ${g.name}`,
      db
        .from('student_groups')
        .upsert({ id: g.id, organization_id: ORG_ID, name: g.name, status: g.status }, { onConflict: 'id' })
    )
    for (const student_id of g.studentIds) {
      await expectOk(
        `group member ${g.name}`,
        db
          .from('student_group_members')
          .upsert({ group_id: g.id, student_id }, { onConflict: 'group_id,student_id' })
      )
    }
  }

  console.log('▶ Subscriptions')
  if (subs.length) {
    await expectOk('subscriptions', db.from('subscriptions').upsert(subs, { onConflict: 'id' }))
  }

  console.log(`▶ Lessons (${lessons.length}, one at a time — EXCLUDE overlap constraint)`)
  const overlapSkips: string[] = []
  let inserted = 0
  for (const l of lessons) {
    const { error } = await db.from('lessons').upsert(
      {
        id: l.id,
        organization_id: ORG_ID,
        teacher_id: l.teacher_id,
        start_at: l.start_at,
        end_at: l.end_at,
        status: l.status,
        cancel_reason: l.cancel_reason,
        lesson_type: l.lesson_type,
        max_students: l.max_students,
        price_per_student: l.price_per_student,
      },
      { onConflict: 'id' }
    )
    if (error) {
      overlapSkips.push(`airtable#${l.airtableId} ${l.start_at} (${l.status}): ${error.message.slice(0, 120)}`)
      continue
    }
    inserted++
    const junction = l.studentIds.map((student_id) => ({
      lesson_id: l.id,
      student_id,
      organization_id: ORG_ID,
    }))
    await expectOk(
      `lesson_students #${l.airtableId}`,
      db.from('lesson_students').upsert(junction, { onConflict: 'lesson_id,student_id' })
    )
    if (inserted % 100 === 0) console.log(`  … ${inserted}/${lessons.length}`)
  }
  console.log(`  ✓ ${inserted} lessons inserted, ${overlapSkips.length} skipped (overlap/constraint)`)

  console.log('▶ Cancellation events')
  for (const ce of cancelEvents) {
    // The linked lesson may itself have been skipped by the overlap constraint.
    const { error } = await db.from('student_cancellation_events').upsert(ce, { onConflict: 'id' })
    if (error) exceptions.push(`cancellation event ${ce.id}: ${error.message}`)
  }

  console.log('▶ Historical monthly billing')
  for (const b of billingRows) {
    await expectOk(
      `billing ${b.student_id} ${b.billing_month}`,
      db.from('student_monthly_billing').upsert(b, { onConflict: 'organization_id,student_id,billing_month' })
    )
  }

  console.log('▶ Homework templates')
  if (homework.length) {
    await expectOk('homework', db.from('homework_templates').upsert(homework, { onConflict: 'id' }))
  }

  console.log('▶ SaaS plan upgrade (advanced, 3 months)')
  const periodStart = DateTime.now().toUTC()
  await expectOk(
    'organization_subscriptions',
    db
      .from('organization_subscriptions')
      .update({
        plan_id: ADVANCED_PLAN_ID,
        status: 'active',
        current_period_start: periodStart.toISO(),
        current_period_end: periodStart.plus({ months: 3 }).toISO(),
        cancel_at_period_end: false,
      })
      .eq('id', ORG_SUBSCRIPTION_ROW_ID)
      .eq('organization_id', ORG_ID)
  )

  console.log('▶ Superadmin for Hadar')
  const sa = await ensureAuthUser(db, SUPERADMIN_EMAIL, 'Hadar')
  await expectOk(
    'superadmin profile',
    db.from('profiles').upsert(
      { id: sa.id, organization_id: null, full_name: 'Hadar', role: 'superadmin', is_active: true },
      { onConflict: 'id' }
    )
  )
  if (sa.created) {
    console.log(`  + superadmin ${SUPERADMIN_EMAIL} — password: ${sa.password}`)
    console.log('    Change it after first login.')
  } else {
    console.log(`  ↻ ${SUPERADMIN_EMAIL} already existed — profile upgraded to superadmin, password unchanged`)
  }

  // Final report with execution results
  report.execution = { lessonsInserted: inserted, lessonsSkipped: overlapSkips }
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n✓ Migration complete. Full report: ${reportPath}`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
