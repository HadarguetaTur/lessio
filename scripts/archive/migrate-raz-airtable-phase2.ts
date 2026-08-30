/**
 * Phase 2 of the רז מזוריק Airtable migration (phase 1: migrate-raz-airtable.ts).
 * Adds, per Hadar's follow-up decisions:
 *
 *   A. Charges-ledger backfill — a `charges` row for every approved historical
 *      `student_monthly_billing` month, so the "חיובים" page and the dashboard's
 *      open-debt KPI reflect the imported history. paid_at is approximated to the
 *      end of the billing month (Airtable never recorded the actual pay date).
 *   B. Teacher availability — the Airtable weekly_slot grid becomes `availability`
 *      windows for Raz (contiguous slots merged per day).
 *   C. Recurring lessons — slots with reserved students become `lesson_series`
 *      rows + weekly `scheduled` lessons generated from tomorrow until 2026-12-31.
 *      Prices for pair/group series are copied from the student's most recent
 *      historical lesson of the same type (null → engine defaults).
 *
 * Deterministic UUID bands (same a1000000- prefix as phase 1):
 *   10 charges ledger, 11 lesson_series, 12 generated lessons, 13 availability.
 *
 * Usage:
 *   npx tsx scripts/migrate-raz-airtable-phase2.ts --data-dir <dir> --dry-run
 *   npx tsx scripts/migrate-raz-airtable-phase2.ts --data-dir <dir> --yes
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { createClient } from '@supabase/supabase-js'
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

const ORG_ID = '9c3c2b2a-1640-4f7e-a102-3e130e8660c2'
const EXPECTED_ORG_NAME = 'רז מזוריק'
const TIMEZONE = 'Asia/Jerusalem'
const RAZ_TEACHER_ID = '41eb53af-c36b-41ad-88ef-9719966093df'
const RAZ_PROFILE_ID = '937eb93a-15f3-46f5-80ce-def7aef350a9'
const SERIES_UNTIL = '2026-12-31'

const uid = (band: string, seq: number): string =>
  `a1000000-0000-4000-8000-${band}${String(seq).padStart(10, '0')}`

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

async function expectOk(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p
  if (error) fail(`${label}: ${error.message}`)
}

/**
 * Rebuild the Airtable-rec → student-uuid map with the exact phase-1 algorithm
 * over the same students.json extract, so the deterministic ids line up.
 * (Kept as a copy on purpose — both scripts are one-off and frozen together.)
 */
function buildStudentMap(dataDir: string): Map<string, string> {
  const parsed = JSON.parse(readFileSync(join(dataDir, 'students.json'), 'utf8'))
  const F = { name: 'fldNJFqByVsu71fbP', phone: 'fldu5Zi7NycCc5Y2Q' }
  type Draft = { recIds: string[]; name: string; filled: number }
  const byKey = new Map<string, Draft[]>()
  for (const r of parsed.records) {
    const name = String(r.cellValuesByFieldId[F.name] ?? '').replace(/\s+/g, ' ').trim()
    if (!name) continue
    const rawPhone = String(r.cellValuesByFieldId[F.phone] ?? '')
      .replace(/[‎‏‪-‮]/g, '')
      .trim()
    let phone: string | null = null
    try {
      phone = rawPhone ? normalizePhone(rawPhone) : null
    } catch {
      phone = null
    }
    const firstName = name.split(' ')[0]
    const key = phone ? `phone:${phone}:${firstName}` : `name:${name}`
    const list = byKey.get(key) ?? []
    list.push({ recIds: [r.id], name, filled: Object.keys(r.cellValuesByFieldId).length })
    byKey.set(key, list)
  }
  const map = new Map<string, string>()
  let seq = 0
  for (const [, list] of byKey) {
    list.sort((a, b) => b.filled - a.filled)
    const canonical = list[0]
    for (const dup of list.slice(1)) canonical.recIds.push(...dup.recIds)
    const id = uid('03', ++seq)
    for (const rec of canonical.recIds) map.set(rec, id)
  }
  return map
}

type Slot = { id: string; day: number; start: string; dur: number; type: string; students: string[] }

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
  if (!supabaseUrl || !serviceRoleKey) fail('Missing Supabase env vars')
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id, name')
    .eq('id', ORG_ID)
    .single()
  if (orgErr || !org) fail(`Target org not found: ${orgErr?.message}`)
  if (org.name !== EXPECTED_ORG_NAME) fail(`Org name mismatch ("${org.name}") — aborting`)

  const report: Record<string, unknown> = {}
  const exceptions: string[] = []
  const recToStudentId = buildStudentMap(dataDir)
  const slots = (JSON.parse(readFileSync(join(dataDir, 'slots.json'), 'utf8')).records as Slot[])

  // ── A. Charges ledger from historical billing rows ──────────────────────────

  const { data: billingRows, error: bErr } = await db
    .from('student_monthly_billing')
    .select('id, student_id, parent_id, billing_month, total_amount, is_paid, is_approved')
    .eq('organization_id', ORG_ID)
    .order('billing_month')
  if (bErr) fail(`read billing rows: ${bErr.message}`)

  const ledger: Record<string, unknown>[] = []
  let noParent = 0
  let notApproved = 0
  for (const b of billingRows ?? []) {
    if (!b.is_approved) { notApproved++; continue } // engine convention: no ledger entry
    if (!b.parent_id) { noParent++; continue }      // charges.parent_id is NOT NULL
    // charge id derived from the billing row's own deterministic suffix (band 09 → 10)
    const seqSuffix = b.id.slice(-10)
    const paidAt = b.is_paid
      ? DateTime.fromFormat(b.billing_month, 'yyyy-MM', { zone: TIMEZONE })
          .endOf('month')
          .toUTC()
          .toISO()
      : null
    ledger.push({
      id: `a1000000-0000-4000-8000-10${seqSuffix}`,
      organization_id: ORG_ID,
      parent_id: b.parent_id,
      billing_record_id: b.id,
      billing_month: b.billing_month,
      amount: b.total_amount,
      charge_type: 'monthly',
      status: b.is_paid ? 'paid' : 'pending',
      paid_at: paidAt,
      notes: `MONTHLY_CHARGE:${b.billing_month}`, // stable code, resolved by renderNote at display time
    })
  }
  report.ledger = {
    billingRows: billingRows?.length ?? 0,
    chargesToCreate: ledger.length,
    skippedNotApproved: notApproved,
    skippedNoParent: noParent,
    paidAtNote: 'paid_at approximated to end of billing month',
  }

  // ── B. Availability windows (merge contiguous slots per day) ────────────────

  type Interval = { startMin: number; endMin: number }
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const toTime = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`

  const byDay = new Map<number, Interval[]>()
  for (const s of slots) {
    const day = s.day - 1 // Airtable day_num 1=Sunday → Lessio day_of_week 0=Sunday
    const startMin = toMin(s.start)
    const list = byDay.get(day) ?? []
    list.push({ startMin, endMin: startMin + s.dur })
    byDay.set(day, list)
  }
  const availability: Record<string, unknown>[] = []
  let availSeq = 0
  for (const [day, intervals] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    intervals.sort((a, b) => a.startMin - b.startMin)
    const merged: Interval[] = []
    for (const iv of intervals) {
      const last = merged[merged.length - 1]
      if (last && iv.startMin <= last.endMin) last.endMin = Math.max(last.endMin, iv.endMin)
      else merged.push({ ...iv })
    }
    for (const iv of merged) {
      availability.push({
        id: uid('13', ++availSeq),
        organization_id: ORG_ID,
        teacher_id: RAZ_TEACHER_ID,
        day_of_week: day,
        start_time: toTime(iv.startMin),
        end_time: toTime(iv.endMin),
      })
    }
  }
  report.availability = { slotSource: slots.length, mergedWindows: availability.length }

  // ── C. Series + future lessons for reserved slots ───────────────────────────

  // Latest historical price_per_student per (student, lesson_type), for pair/group pricing.
  const { data: histLessons, error: hErr } = await db
    .from('lessons')
    .select('start_at, lesson_type, price_per_student, lesson_students(student_id)')
    .eq('organization_id', ORG_ID)
    .not('price_per_student', 'is', null)
    .order('start_at', { ascending: false })
    .limit(2000)
  if (hErr) fail(`read historical lessons: ${hErr.message}`)
  const latestPrice = new Map<string, number>()
  for (const l of histLessons ?? []) {
    for (const ls of (l.lesson_students as { student_id: string }[]) ?? []) {
      const key = `${ls.student_id}:${l.lesson_type}`
      if (!latestPrice.has(key)) latestPrice.set(key, Number(l.price_per_student))
    }
  }

  const reserved = slots.filter((s) => s.students.length > 0)
  const now = DateTime.now().setZone(TIMEZONE)
  const until = DateTime.fromISO(SERIES_UNTIL, { zone: TIMEZONE }).endOf('day')

  type SeriesPlan = {
    series: Record<string, unknown>
    lessons: Record<string, unknown>[]
    junctions: Map<string, string[]> // lesson id → student ids
  }
  const plans: SeriesPlan[] = []
  let seriesSeq = 0
  let lessonSeq = 0
  const seriesSkips: string[] = []

  for (const s of reserved) {
    const studentIds = [
      ...new Set(s.students.map((rec) => recToStudentId.get(rec)).filter(Boolean)),
    ] as string[]
    if (studentIds.length === 0) {
      seriesSkips.push(`slot ${s.id}: no resolvable students`)
      continue
    }
    let lessonType = s.type === 'זוגי' ? 'pair' : s.type === 'קבוצתי' ? 'group' : 'individual'
    if (lessonType === 'individual' && studentIds.length > 1) {
      lessonType = studentIds.length === 2 ? 'pair' : 'group'
    }
    const price =
      lessonType === 'individual' ? null : latestPrice.get(`${studentIds[0]}:${lessonType}`) ?? null

    const dayOfWeek = s.day - 1 // 0 = Sunday
    const seriesId = uid('11', ++seriesSeq)
    const [h, m] = s.start.split(':').map(Number)

    const lessons: Record<string, unknown>[] = []
    const junctions = new Map<string, string[]>()
    // First occurrence strictly after today, then weekly until SERIES_UNTIL.
    let cursor = now.plus({ days: 1 }).startOf('day')
    while ((cursor.weekday % 7) !== dayOfWeek) cursor = cursor.plus({ days: 1 })
    for (let d = cursor; d <= until; d = d.plus({ weeks: 1 })) {
      const start = d.set({ hour: h, minute: m })
      const lessonId = uid('12', ++lessonSeq)
      lessons.push({
        id: lessonId,
        organization_id: ORG_ID,
        teacher_id: RAZ_TEACHER_ID,
        series_id: seriesId,
        start_at: start.toUTC().toISO()!,
        end_at: start.plus({ minutes: s.dur }).toUTC().toISO()!,
        status: 'scheduled',
        lesson_type: lessonType,
        max_students: studentIds.length,
        price_per_student: price,
      })
      junctions.set(lessonId, studentIds)
    }
    plans.push({
      series: {
        id: seriesId,
        organization_id: ORG_ID,
        teacher_id: RAZ_TEACHER_ID,
        student_id: studentIds[0], // display-only column, no FK
        rule: {
          frequency: 'weekly',
          day_of_week: dayOfWeek,
          start_time: s.start,
          duration_minutes: s.dur,
          until: SERIES_UNTIL,
        },
        created_by: RAZ_PROFILE_ID,
      },
      lessons,
      junctions,
    })
  }
  const totalFutureLessons = plans.reduce((n, p) => n + p.lessons.length, 0)
  report.series = {
    reservedSlots: reserved.length,
    seriesToCreate: plans.length,
    futureLessons: totalFutureLessons,
    until: SERIES_UNTIL,
    skipped: seriesSkips,
  }

  report.exceptions = exceptions
  const reportPath = join(dataDir, 'migration-report-phase2.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`Report written to ${reportPath}`)
  console.log(
    `\nPlan: ${ledger.length} ledger charges (${noParent} skipped, no parent), ` +
      `${availability.length} availability windows, ${plans.length} series, ${totalFutureLessons} future lessons`
  )
  if (dryRun) {
    console.log('\n--dry-run: no writes performed.')
    return
  }

  console.log('\n▶ Charges ledger')
  for (let i = 0; i < ledger.length; i += 100) {
    await expectOk(`charges batch ${i}`, db.from('charges').upsert(ledger.slice(i, i + 100), { onConflict: 'id' }))
  }

  console.log('▶ Availability')
  await expectOk('availability', db.from('availability').upsert(availability, { onConflict: 'id' }))

  console.log(`▶ Series + future lessons (${totalFutureLessons}, one at a time)`)
  const overlapSkips: string[] = []
  let inserted = 0
  for (const p of plans) {
    await expectOk('lesson_series', db.from('lesson_series').upsert(p.series, { onConflict: 'id' }))
    for (const l of p.lessons) {
      const { error } = await db.from('lessons').upsert(l, { onConflict: 'id' })
      if (error) {
        overlapSkips.push(`${l.start_at}: ${error.message.slice(0, 100)}`)
        continue
      }
      inserted++
      const junction = (p.junctions.get(l.id as string) ?? []).map((student_id) => ({
        lesson_id: l.id,
        student_id,
        organization_id: ORG_ID,
      }))
      await expectOk(
        `lesson_students ${l.id}`,
        db.from('lesson_students').upsert(junction, { onConflict: 'lesson_id,student_id' })
      )
      if (inserted % 100 === 0) console.log(`  … ${inserted}/${totalFutureLessons}`)
    }
  }
  console.log(`  ✓ ${inserted} future lessons inserted, ${overlapSkips.length} skipped`)

  report.execution = { ledgerCharges: ledger.length, futureLessonsInserted: inserted, lessonsSkipped: overlapSkips }
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n✓ Phase 2 complete. Full report: ${reportPath}`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
