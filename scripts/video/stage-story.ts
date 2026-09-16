/**
 * Stage the "one cancellation" story for the product video — and put it back.
 *
 *   CENTER_DEMO_ALLOW_REMOTE=1 npx tsx --tsconfig tsconfig.json scripts/video/stage-story.ts \
 *     --org-id d3000000-0000-4000-8000-000000000000 --apply | --rearm | --undo
 *
 * Result first, action second: --apply puts the tenant into the state the
 * cameras film (lesson cancelled through the real core, bill reopened, a
 * vacation on the teacher, the WhatsApp thread in the inbox). --rearm resets
 * only what an on-camera click changed, for a retake. --undo restores every row
 * it touched from the state file it wrote before touching anything.
 *
 * Nothing here sends a message: cancelLessonCore has no send path, the thread
 * rows are local, and the parent is refused if it is the Meta-verified number.
 */

import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { DateTime } from 'luxon'
import { getClient, ORG_ID, TZ, VERIFIED_PARENT_PHONE, fail, uid, T } from '../center-demo/shared'
import { cancelLessonCore } from '@/lib/cancellation-flow/cancelLessonCore'
import { buildStudentMonth } from '@/lib/billing/monthly/buildStudentMonth'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { botString } from '@/lib/whatsapp/strings'
import { DEFAULT_TEMPLATES, substituteVars } from '@/lib/whatsapp/templates'

/** ניצן אזולאי's 16/09 lesson with ליאת נחמיאס — chosen from the seeded roster on 15.09.2026. */
const STORY = {
  lessonId: 'd3000001-0006-4000-8000-00000000216d',
  studentId: 'd3000001-0003-4000-8000-00000000009c',
  parentId: 'd3000001-0002-4000-8000-00000000006e',
  teacherId: 'd3000001-0001-4000-8000-000000000009',
}
const STATE = 'video-assets/story-state.json'
const VACATION_ID = uid(T.override, 900)
const WA_PREFIX = 'demo-story-'
const LESSON_COLS = 'status, cancel_reason, cancelled_at, cancelled_by_profile_id, cancellation_source, updated_at'

type Row = Record<string, unknown>
const db = getClient()
const mode = ['--apply', '--rearm', '--undo'].find((f) => process.argv.includes(f)) ?? fail('pass --apply, --rearm or --undo')

async function one<R = Row>(label: string, p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<R> {
  const { data, error } = await p
  if (error) fail(`${label}: ${error.message}`)
  return data as R
}

async function rebuildBill(billingMonth: string, approved: boolean): Promise<Row> {
  const policy = await getOrgBillingPolicy(ORG_ID)
  await one('unapprove bill', db.from('student_monthly_billing').update({ is_approved: false })
    .eq('organization_id', ORG_ID).eq('student_id', STORY.studentId).eq('billing_month', billingMonth))
  await buildStudentMonth(ORG_ID, STORY.studentId, billingMonth, TZ, undefined, policy.cycleStartDay, policy.dueDays)
  if (approved) fail('rebuildBill never re-approves — approval is filmed')
  return one('bill', db.from('student_monthly_billing').select('*')
    .eq('organization_id', ORG_ID).eq('student_id', STORY.studentId).eq('billing_month', billingMonth).single())
}

async function apply(): Promise<void> {
  if (existsSync(STATE)) fail(`${STATE} exists — already applied. Run --undo first.`)

  const lesson = await one<Row>('lesson', db.from('lessons').select(`id, start_at, end_at, teacher_id, ${LESSON_COLS}`).eq('id', STORY.lessonId).eq('organization_id', ORG_ID).single())
  if (lesson.status !== 'scheduled') fail(`lesson is ${lesson.status}, expected scheduled`)
  const parent = await one<Row>('parent', db.from('parents').select('id, full_name, phone').eq('id', STORY.parentId).single())
  if (parent.phone === VERIFIED_PARENT_PHONE) fail('story parent is the Meta-verified number — refusing')
  const student = await one<Row>('student', db.from('students').select('full_name').eq('id', STORY.studentId).single())
  const teacher = await one<{ profiles: { full_name: string } }>('teacher', db.from('teachers').select('profiles(full_name)').eq('id', STORY.teacherId).single())

  const start = DateTime.fromISO(lesson.start_at as string).setZone(TZ)
  const billingMonth = start.toFormat('yyyy-MM')
  const bill = await one<Row>('bill', db.from('student_monthly_billing').select('*').eq('organization_id', ORG_ID).eq('student_id', STORY.studentId).eq('billing_month', billingMonth).single())
  if (bill.is_paid) fail('story bill is already paid')
  const charges = await one<Row[]>('charges', db.from('charges').select('*').eq('organization_id', ORG_ID).eq('billing_record_id', bill.id as string))
  const events = await one<Row[]>('events', db.from('student_cancellation_events').select('id').eq('lesson_id', STORY.lessonId).eq('student_id', STORY.studentId))

  // A vacation day on a date the teacher works but has nothing booked, so adding it cancels nothing.
  const avail = await one<{ day_of_week: number }[]>('availability', db.from('availability').select('day_of_week').eq('teacher_id', STORY.teacherId))
  const workDays = new Set(avail.map((a) => a.day_of_week))
  let vacationDate: string | null = null
  for (let d = 21; d <= 45 && !vacationDate; d++) {
    const day = DateTime.now().setZone(TZ).plus({ days: d }).startOf('day')
    if (!workDays.has(day.weekday % 7)) continue
    const booked = await one<Row[]>('lessons on day', db.from('lessons').select('id').eq('teacher_id', STORY.teacherId).neq('status', 'cancelled')
      .gte('start_at', day.toUTC().toISO()!).lt('start_at', day.plus({ days: 1 }).toUTC().toISO()!).limit(1))
    if (booked.length === 0) vacationDate = day.toISODate()
  }
  if (!vacationDate) fail('no lesson-free workday found for the vacation')

  const applyAt = new Date().toISOString()
  mkdirSync('video-assets', { recursive: true })
  writeFileSync(STATE, JSON.stringify({ applyAt, lesson, bill, charges, eventIds: events.map((e) => e.id), vacationDate, phone: parent.phone }, null, 2))

  // 1. The cancellation, through the one real path. Parent actor, WhatsApp source.
  const outcome = await cancelLessonCore({ lessonId: STORY.lessonId, orgId: ORG_ID, actor: { kind: 'parent', parentId: STORY.parentId }, source: 'whatsapp' })
  if (!outcome.success) fail(`cancelLessonCore: ${outcome.error}`)
  const line = outcome.lines[0]

  // 2. Reopen the month so the confirm → recalc → approve sequence can be filmed.
  const rebuilt = await rebuildBill(billingMonth, false)

  // 3. The teacher's vacation, already on the calendar.
  await one('vacation', db.from('availability_overrides').insert({ id: VACATION_ID, organization_id: ORG_ID, teacher_id: STORY.teacherId, override_date: vacationDate, is_available: false, start_time: null, end_time: null, reason: 'חופשה' }))

  // 4. The thread the inbox shows — the same real bot strings as the mockup.
  const date = start.toFormat('dd/MM')
  const time = start.toFormat('HH:mm')
  const vars = { student_name: String(student.full_name), teacher_name: teacher.profiles.full_name, date, time }
  const now = DateTime.now()
  const msgs: Array<{ dir: 'in' | 'out'; kind?: string; body: string; ago: number }> = [
    { dir: 'in', body: botString('menu_cancel', 'he'), ago: 7 },
    { dir: 'out', kind: 'interactive', body: botString('cancellation_list_header', 'he'), ago: 7 },
    { dir: 'in', body: `${vars.student_name} — ${date}`, ago: 6 },
    { dir: 'out', kind: 'interactive', body: botString('cancel_confirm_body', 'he', vars), ago: 6 },
    { dir: 'in', body: botString('cancel_confirm_yes', 'he'), ago: 5 },
    { dir: 'out', body: substituteVars(DEFAULT_TEMPLATES.he.cancellation_confirmation, { ...vars, charge_line: `\n${botString('charge_pending', 'he')}` }), ago: 5 },
  ]
  await one('whatsapp_messages', db.from('whatsapp_messages').insert(msgs.map((m, i) => ({
    organization_id: ORG_ID, phone: parent.phone, direction: m.dir, origin: m.dir === 'out' ? 'bot' : null, parent_id: STORY.parentId,
    sender_role: m.dir === 'in' ? 'parent' : null, kind: m.kind ?? 'text', body: m.body, wa_message_id: `${WA_PREFIX}${i}`,
    status: m.dir === 'in' ? 'received' : 'read', created_at: now.minus({ minutes: m.ago, seconds: 50 - i * 8 }).toUTC().toISO(),
  }))))

  console.log(JSON.stringify({
    student: vars.student_name, parent: parent.full_name, teacher: vars.teacher_name, date, time,
    chargeType: line.chargeType, amount: line.amount, recorded: line.recorded, vacationDate,
    billAfter: { total: rebuilt.total_amount, cancellations: rebuilt.cancellations_amount, approved: rebuilt.is_approved },
  }, null, 2))
}

async function rearm(): Promise<void> {
  const s = JSON.parse(readFileSync(STATE, 'utf8'))
  await one('event pending', db.from('student_cancellation_events').update({ is_charged: false, charge_override: null }).eq('lesson_id', STORY.lessonId).eq('student_id', STORY.studentId))
  const bill = await rebuildBill(s.bill.billing_month, false)
  console.log(`re-armed: event pending, bill total ${bill.total_amount}, approved ${bill.is_approved}`)
}

async function undo(): Promise<void> {
  if (!existsSync(STATE)) fail(`${STATE} not found — nothing to undo`)
  const s = JSON.parse(readFileSync(STATE, 'utf8'))
  const billId = s.bill.id as string

  const { id: _l, start_at: _s, end_at: _e, teacher_id: _t, ...lessonFields } = s.lesson
  await one('restore lesson', db.from('lessons').update(lessonFields).eq('id', STORY.lessonId).eq('organization_id', ORG_ID))

  const events = await one<Row[]>('events', db.from('student_cancellation_events').select('id').eq('lesson_id', STORY.lessonId).eq('student_id', STORY.studentId))
  const newEvents = events.map((e) => e.id as string).filter((id) => !s.eventIds.includes(id))
  if (newEvents.length) await one('delete events', db.from('student_cancellation_events').delete().in('id', newEvents))

  const savedIds = (s.charges as Row[]).map((c) => c.id as string)
  const current = await one<Row[]>('charges', db.from('charges').select('id').eq('organization_id', ORG_ID).eq('billing_record_id', billId))
  const extra = current.map((c) => c.id as string).filter((id) => !savedIds.includes(id))
  const auditCharges = [...savedIds, ...extra]
  if (auditCharges.length) {
    const { error } = await db.from('charge_audit_log').delete().eq('organization_id', ORG_ID).gte('created_at', s.applyAt).in('charge_id', auditCharges)
    if (error) console.warn(`  ! charge_audit_log cleanup skipped: ${error.message}`)
  }
  if (extra.length) await one('delete new charges', db.from('charges').delete().in('id', extra))
  if (s.charges.length) await one('restore charges', db.from('charges').upsert(s.charges, { onConflict: 'id' }))

  const { id: _b, ...billFields } = s.bill
  await one('restore bill', db.from('student_monthly_billing').update(billFields).eq('id', billId))
  await one('delete vacation', db.from('availability_overrides').delete().eq('id', VACATION_ID))
  await one('delete thread', db.from('whatsapp_messages').delete().eq('organization_id', ORG_ID).like('wa_message_id', `${WA_PREFIX}%`))

  const lesson = await one<Row>('verify lesson', db.from('lessons').select('status').eq('id', STORY.lessonId).single())
  const bill = await one<Row>('verify bill', db.from('student_monthly_billing').select('total_amount, is_approved, is_paid').eq('id', billId).single())
  const ok = lesson.status === s.lesson.status && Number(bill.total_amount) === Number(s.bill.total_amount) && bill.is_approved === s.bill.is_approved
  renameSync(STATE, `${STATE}.undone-${Date.now()}`)
  console.log(`${ok ? '✓' : '✗'} undo: lesson ${lesson.status}, bill ${bill.total_amount} approved=${bill.is_approved}`)
  if (!ok) process.exit(1)
}

;(mode === '--apply' ? apply() : mode === '--rearm' ? rearm() : undo()).catch((err) => fail(String(err?.stack ?? err)))
