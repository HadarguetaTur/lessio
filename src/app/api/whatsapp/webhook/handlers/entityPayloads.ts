/**
 * Taps on buttons attached to proactive messages — a lesson reminder's
 * "confirm attendance" / "need to cancel", a homework message's "done".
 *
 * These run BEFORE the webhook forks on the sender's preferred capacity,
 * because a reminder is addressed to a phone, not to a role. A phone that is
 * both a parent and a teacher, with teacher preferred, would otherwise route
 * the tap into the teacher flow, which knows nothing about it and answers with
 * a menu. So identity is resolved here from the phone directly: whoever this
 * number is a parent or a student for, that is who may answer.
 *
 * Ownership is re-checked against the database on every tap. The reply id came
 * from the client and names a specific lesson or assignment; nothing about
 * having been sent a button proves the tapper still may act on it — or ever
 * could.
 */

import { DateTime } from 'luxon'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendTextMessage } from '@/lib/whatsapp'
import { botString } from '@/lib/whatsapp/strings'
import type { EntityPayload } from '@/lib/whatsapp/entityPayloads'
import type { AppLocale } from '@/lib/i18n/locale'
import { handleCancellationPayload, type CancellationActor } from '../cancellation'
import {
  findBillingParent,
  findOpenAssignments,
  markAssignmentDoneAndAlert,
  studentDisplayName,
} from '../shared'

type Db = ReturnType<typeof createServiceRoleClient>

export type EntityPayloadParams = {
  db: Db
  orgId: string
  senderPhone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
  timezone: string
  cancellationEnabled: boolean
  payload: EntityPayload
}

/**
 * Who this phone is, for the purposes of answering a button.
 *
 * `studentIds` is the union of the children a parent on this number has and the
 * student this number belongs to — everyone whose lesson or homework the tapper
 * legitimately answers for.
 */
type TapperIdentity = {
  parentId: string | null
  ownStudentId: string | null
  studentIds: string[]
}

/**
 * Handles a tapped `att:`/`hw:` payload. Returns false when this phone has no
 * standing to answer, so the caller can carry on with normal routing rather
 * than swallowing the message.
 */
export async function handleEntityPayload(params: EntityPayloadParams): Promise<boolean> {
  const { db, orgId, payload } = params

  const identity = await resolveTapper(db, orgId, params.senderPhone)
  if (identity.studentIds.length === 0) {
    console.warn('[whatsapp/entity] Tap from a phone with no student to answer for', {
      orgId,
      payload: payload.kind,
    })
    return false
  }

  if (payload.kind === 'attendance') {
    return payload.action === 'ok'
      ? confirmAttendance(params, identity, payload.lessonId)
      : startCancelForLesson(params, identity, payload.lessonId)
  }

  return markHomeworkDone(params, identity, payload.assignmentId)
}

// ── Identity ──────────────────────────────────────────────────────────────────

async function resolveTapper(db: Db, orgId: string, phone: string): Promise<TapperIdentity> {
  const [parentRes, studentRes] = await Promise.all([
    db
      .from('parents')
      .select('id')
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .eq('is_active', true)
      .maybeSingle(),
    // students.phone has no uniqueness constraint, so take the first by id —
    // the same stable choice resolveSender makes.
    db
      .from('students')
      .select('id')
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(1),
  ])

  const parentId = (parentRes.data as { id: string } | null)?.id ?? null
  const ownStudentId = ((studentRes.data ?? []) as { id: string }[])[0]?.id ?? null

  const studentIds = new Set<string>()
  if (ownStudentId) studentIds.add(ownStudentId)

  if (parentId) {
    const { data: rels } = await db
      .from('relationships')
      .select('student_id')
      .eq('organization_id', orgId)
      .eq('parent_id', parentId)
    for (const r of (rels ?? []) as { student_id: string }[]) studentIds.add(r.student_id)
  }

  return { parentId, ownStudentId, studentIds: [...studentIds] }
}

/** Which capacity the tap should be recorded under. */
function capacityFor(identity: TapperIdentity, studentId: string): 'parent' | 'student' {
  return identity.ownStudentId === studentId ? 'student' : 'parent'
}

// ── Attendance ────────────────────────────────────────────────────────────────

async function confirmAttendance(
  params: EntityPayloadParams,
  identity: TapperIdentity,
  lessonId: string
): Promise<boolean> {
  const { db, orgId, senderPhone, accessToken, phoneNumberId, locale } = params

  const studentId = await lessonStudentFor(db, orgId, lessonId, identity.studentIds)
  if (!studentId) {
    await reply(params, 'attendance_lesson_gone')
    return true
  }

  const { data: lesson } = await db
    .from('lessons')
    .select('id, status, attendance_confirmed_at')
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .maybeSingle()

  const row = lesson as { status: string; attendance_confirmed_at: string | null } | null
  if (!row || row.status !== 'scheduled') {
    await reply(params, 'attendance_lesson_gone')
    return true
  }

  // A second tap is answered exactly like the first: the parent cannot see
  // whether the first one registered, so silence would read as a failure. The
  // original timestamp stands.
  if (!row.attendance_confirmed_at) {
    const { error } = await db
      .from('lessons')
      .update({
        attendance_confirmed_at: DateTime.utc().toISO(),
        attendance_confirmed_by: capacityFor(identity, studentId),
      })
      .eq('id', lessonId)
      .eq('organization_id', orgId)

    if (error) {
      console.error('[whatsapp/entity] Could not record attendance confirmation', {
        orgId,
        lessonId,
        error,
      })
    }
  }

  await sendTextMessage(
    senderPhone,
    botString('attendance_confirmed', locale),
    accessToken,
    phoneNumberId
  )

  console.info('[whatsapp/entity] Attendance confirmed', { orgId, lessonId })
  return true
}

/**
 * "Need to cancel" on a reminder jumps straight to the confirm step for that
 * one lesson, rather than opening the full list — the parent already told us
 * which lesson they mean.
 */
async function startCancelForLesson(
  params: EntityPayloadParams,
  identity: TapperIdentity,
  lessonId: string
): Promise<boolean> {
  const { db, orgId } = params

  if (!params.cancellationEnabled) {
    await reply(params, 'no_eligible_lessons')
    return true
  }

  const studentId = await lessonStudentFor(db, orgId, lessonId, identity.studentIds)
  if (!studentId) {
    await reply(params, 'attendance_lesson_gone')
    return true
  }

  const actor = await cancellationActorFor(params, identity, studentId)
  if (!actor) return true

  await handleCancellationPayload({
    actor,
    payload: { step: 'pick', lessonId },
    orgId,
    senderPhone: params.senderPhone,
    timezone: params.timezone,
    accessToken: params.accessToken,
    phoneNumberId: params.phoneNumberId,
    locale: params.locale,
  })
  return true
}

/**
 * The actor a cancellation runs as. A charge always lands on a parent, so a
 * student tapping their own reminder still cancels through their billing
 * parent — the same rule the student handler follows.
 */
async function cancellationActorFor(
  params: EntityPayloadParams,
  identity: TapperIdentity,
  studentId: string
): Promise<CancellationActor | null> {
  const { db, orgId } = params

  if (capacityFor(identity, studentId) === 'parent' && identity.parentId) {
    return { parentId: identity.parentId, cancelledBy: 'parent' }
  }

  const parent = await findBillingParent(db, orgId, studentId)
  if (!parent) {
    await reply(params, 'student_no_parent_linked')
    return null
  }

  return {
    parentId: parent.id,
    studentIds: [studentId],
    cancelledBy: 'student',
    copyTo: parent.phone ? { phone: parent.phone, locale: parent.locale } : null,
  }
}

/**
 * The student on a lesson, when that student is one the tapper answers for.
 * Null means the lesson is not theirs — or does not exist, which from here is
 * the same answer.
 */
async function lessonStudentFor(
  db: Db,
  orgId: string,
  lessonId: string,
  studentIds: string[]
): Promise<string | null> {
  const { data } = await db
    .from('lesson_students')
    .select('student_id')
    .eq('organization_id', orgId)
    .eq('lesson_id', lessonId)
    .in('student_id', studentIds)
    .limit(1)

  return ((data ?? []) as { student_id: string }[])[0]?.student_id ?? null
}

// ── Homework ──────────────────────────────────────────────────────────────────

async function markHomeworkDone(
  params: EntityPayloadParams,
  identity: TapperIdentity,
  assignmentId: string
): Promise<boolean> {
  const { db, orgId, locale } = params

  const open = await findOpenAssignments({
    db,
    orgId,
    studentIds: identity.studentIds,
    limit: 50,
  })
  const assignment = open.find((a) => a.id === assignmentId)

  // Not in the open set: either already done — the common case, a second tap on
  // a message that stays in the chat forever — or never theirs. Both get the
  // same reply; distinguishing them would leak whether the id exists.
  if (!assignment) {
    await reply(params, 'homework_already_done')
    return true
  }

  const markedBy = capacityFor(identity, assignment.studentId)
  const studentName = await studentDisplayName(db, orgId, assignment.studentId, locale)

  await markAssignmentDoneAndAlert({
    db,
    orgId,
    assignment,
    studentName,
    markedBy,
    accessToken: params.accessToken,
    phoneNumberId: params.phoneNumberId,
  })

  await reply(
    params,
    markedBy === 'student' ? 'student_homework_marked' : 'homework_marked_done',
    { title: assignment.title, student_name: studentName }
  )

  console.info('[whatsapp/entity] Homework marked done from a tap', {
    orgId,
    assignmentId,
    markedBy,
  })
  return true
}

// ── Replies ───────────────────────────────────────────────────────────────────

async function reply(
  params: EntityPayloadParams,
  key: Parameters<typeof botString>[0],
  vars: Record<string, string> = {}
): Promise<void> {
  await sendTextMessage(
    params.senderPhone,
    botString(key, params.locale, vars),
    params.accessToken,
    params.phoneNumberId
  )
}
