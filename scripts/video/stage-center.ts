/**
 * Stage the "large center" product video — and put it back.
 *
 *   CENTER_DEMO_ALLOW_REMOTE=1 npx tsx --tsconfig tsconfig.json scripts/video/stage-center.ts \
 *     --org-id d3000000-0000-4000-8000-000000000000 --apply | --undo
 *
 * Two changes, both on עדי הרוש's roster (chosen from the seeded data on 15.09.2026):
 *
 *   1. שקד כץ's individual lesson is cancelled through the real core as if by
 *      the parent on WhatsApp, and the matching thread is written to the inbox.
 *   2. Today's 15:00 "תגבור כיתה ד'" group lesson, auto-completed by the seed, goes
 *      back to scheduled so the teacher can confirm it on camera.
 *
 * Nothing sends: cancelLessonCore has no send path, the thread rows are local,
 * and in a monthly org neither the core nor the teacher's completion creates a
 * charge. --undo restores both lessons from the state file and deletes the
 * cancellation event and thread rows.
 */

import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { DateTime } from 'luxon'
import { getClient, ORG_ID, TZ, VERIFIED_PARENT_PHONE, fail } from '../center-demo/shared'
import { cancelLessonCore } from '@/lib/cancellation-flow/cancelLessonCore'
import { botString } from '@/lib/whatsapp/strings'
import { DEFAULT_TEMPLATES, substituteVars } from '@/lib/whatsapp/templates'

const CENTER = {
  teacherId: 'd3000001-0001-4000-8000-000000000024',
  storyLessonId: 'd3000001-0006-4000-8000-000000000f6d',
  storyStudentId: 'd3000001-0003-4000-8000-000000000025',
  storyParentId: 'd3000001-0002-4000-8000-00000000001a',
  groupLessonId: 'd3000001-0006-4000-8000-00000000098d',
}
const STATE = 'video-assets/center-state.json'
const WA_PREFIX = 'demo-center-'
const LESSON_COLS =
  'status, cancel_reason, cancelled_at, cancelled_by_profile_id, cancellation_source, completed_at, completion_source, ' +
  'delivery_confirmed_at, delivery_confirmed_by_profile_id, delivery_confirmation_source, updated_at'

type Row = Record<string, unknown>
const db = getClient()
const mode = ['--apply', '--undo'].find((f) => process.argv.includes(f)) ?? fail('pass --apply or --undo')

async function one<R = Row>(label: string, p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<R> {
  const { data, error } = await p
  if (error) fail(`${label}: ${error.message}`)
  return data as R
}

async function apply(): Promise<void> {
  if (existsSync(STATE)) fail(`${STATE} exists — already applied. Run --undo first.`)

  const story = await one<Row>('story lesson', db.from('lessons').select(`id, start_at, teacher_id, ${LESSON_COLS}`).eq('id', CENTER.storyLessonId).eq('organization_id', ORG_ID).single())
  const group = await one<Row>('group lesson', db.from('lessons').select(`id, start_at, end_at, teacher_id, lesson_type, ${LESSON_COLS}`).eq('id', CENTER.groupLessonId).eq('organization_id', ORG_ID).single())
  if (story.status !== 'scheduled') fail(`story lesson is ${story.status}, expected scheduled`)
  if (group.status !== 'completed' || group.lesson_type !== 'group') fail(`group lesson is ${group.status}/${group.lesson_type}, expected completed/group`)
  if (story.teacher_id !== CENTER.teacherId || group.teacher_id !== CENTER.teacherId) fail('both lessons must belong to the center teacher')

  const parent = await one<Row>('parent', db.from('parents').select('id, full_name, phone').eq('id', CENTER.storyParentId).single())
  if (parent.phone === VERIFIED_PARENT_PHONE) fail('story parent is the Meta-verified number — refusing')
  const student = await one<Row>('student', db.from('students').select('full_name').eq('id', CENTER.storyStudentId).single())
  const teacher = await one<{ profiles: { full_name: string } }>('teacher', db.from('teachers').select('profiles(full_name)').eq('id', CENTER.teacherId).single())
  const events = await one<Row[]>('events', db.from('student_cancellation_events').select('id').eq('lesson_id', CENTER.storyLessonId))

  const applyAt = new Date().toISOString()
  mkdirSync('video-assets', { recursive: true })
  writeFileSync(STATE, JSON.stringify({ applyAt, story, group, eventIds: events.map((e) => e.id) }, null, 2))

  // 1. The parent's cancellation, through the one real path.
  const outcome = await cancelLessonCore({ lessonId: CENTER.storyLessonId, orgId: ORG_ID, actor: { kind: 'parent', parentId: CENTER.storyParentId }, source: 'whatsapp' })
  if (!outcome.success) fail(`cancelLessonCore: ${outcome.error}`)

  // 2. The group lesson waits for the teacher again.
  await one('reopen group lesson', db.from('lessons').update({
    status: 'scheduled', completed_at: null, completion_source: null,
    delivery_confirmed_at: null, delivery_confirmed_by_profile_id: null, delivery_confirmation_source: null,
  }).eq('id', CENTER.groupLessonId).eq('organization_id', ORG_ID))

  // 3. The thread — the same real bot strings the mockup renders.
  const start = DateTime.fromISO(story.start_at as string).setZone(TZ)
  const vars = { student_name: String(student.full_name), teacher_name: teacher.profiles.full_name, date: start.toFormat('dd/MM'), time: start.toFormat('HH:mm') }
  const now = DateTime.now()
  const msgs: Array<{ dir: 'in' | 'out'; kind?: string; body: string; ago: number }> = [
    { dir: 'in', body: botString('menu_cancel', 'he'), ago: 7 },
    { dir: 'out', kind: 'interactive', body: botString('cancellation_list_header', 'he'), ago: 7 },
    { dir: 'in', body: `${vars.student_name} — ${vars.date}`, ago: 6 },
    { dir: 'out', kind: 'interactive', body: botString('cancel_confirm_body', 'he', vars), ago: 6 },
    { dir: 'in', body: botString('cancel_confirm_yes', 'he'), ago: 5 },
    { dir: 'out', body: substituteVars(DEFAULT_TEMPLATES.he.cancellation_confirmation, { ...vars, charge_line: outcome.pendingTotal > 0 ? `\n${botString('charge_pending', 'he')}` : '' }), ago: 5 },
  ]
  await one('whatsapp_messages', db.from('whatsapp_messages').insert(msgs.map((m, i) => ({
    organization_id: ORG_ID, phone: parent.phone, direction: m.dir, origin: m.dir === 'out' ? 'bot' : null, parent_id: CENTER.storyParentId,
    sender_role: m.dir === 'in' ? 'parent' : null, kind: m.kind ?? 'text', body: m.body, wa_message_id: `${WA_PREFIX}${i}`,
    status: m.dir === 'in' ? 'received' : 'read', created_at: now.minus({ minutes: m.ago, seconds: 50 - i * 8 }).toUTC().toISO(),
  }))))

  console.log(JSON.stringify({
    applyAt, student: vars.student_name, parent: parent.full_name, teacher: vars.teacher_name, date: vars.date, time: vars.time,
    pendingTotal: outcome.pendingTotal, chargeLine: outcome.pendingTotal > 0 ? 'charge_pending' : 'none',
    groupLesson: { id: CENTER.groupLessonId, at: DateTime.fromISO(group.start_at as string).setZone(TZ).toFormat('HH:mm'), reopened: true },
    chatTimes: msgs.map((m) => now.minus({ minutes: m.ago }).setZone(TZ).toFormat('HH:mm')),
  }, null, 2))
}

async function undo(): Promise<void> {
  if (!existsSync(STATE)) fail(`${STATE} not found — nothing to undo`)
  const s = JSON.parse(readFileSync(STATE, 'utf8'))

  for (const key of ['story', 'group'] as const) {
    const saved = s[key] as Row
    const fields = Object.fromEntries(LESSON_COLS.split(',').map((c) => c.trim()).map((c) => [c, saved[c]]))
    await one(`restore ${key} lesson`, db.from('lessons').update(fields).eq('id', saved.id as string).eq('organization_id', ORG_ID))
  }

  const events = await one<Row[]>('events', db.from('student_cancellation_events').select('id').eq('lesson_id', CENTER.storyLessonId))
  const created = events.map((e) => e.id as string).filter((id) => !s.eventIds.includes(id))
  if (created.length) await one('delete events', db.from('student_cancellation_events').delete().in('id', created))
  await one('delete thread', db.from('whatsapp_messages').delete().eq('organization_id', ORG_ID).like('wa_message_id', `${WA_PREFIX}%`))

  const story = await one<Row>('verify story', db.from('lessons').select('status').eq('id', CENTER.storyLessonId).single())
  const group = await one<Row>('verify group', db.from('lessons').select('status, completion_source').eq('id', CENTER.groupLessonId).single())
  const ok = story.status === s.story.status && group.status === s.group.status && group.completion_source === s.group.completion_source
  renameSync(STATE, `${STATE}.undone-${Date.now()}`)
  console.log(`${ok ? '✓' : '✗'} undo: story ${story.status}, group ${group.status}/${group.completion_source}`)
  if (!ok) process.exit(1)
}

;(mode === '--apply' ? apply() : undo()).catch((err) => fail(String(err?.stack ?? err)))
