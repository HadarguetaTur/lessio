'use server'

import { revalidatePath } from 'next/cache'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { updateLessonStatus, LessonStatus } from '@/lib/lessons'
import { createNote, deleteNote } from '@/lib/lessons/notes'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createLessonCharge } from '@/lib/billing/createCharge'
import {
  cancelLessonCore,
  type CancellationActor,
  type CancellationError,
} from '@/lib/cancellation-flow/cancelLessonCore'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { autoSendPaymentRequest } from '@/lib/payment-request/autoSend'
import { stopLessonSeries } from '@/lib/lessons/cancelSeries'
import { notifyMultiple, getOwnerAndAdminProfileIds, getTeacherProfileId } from '@/lib/notifications'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { decryptToken } from '@/lib/crypto'
import { botString } from '@/lib/whatsapp/strings'
import { resolveRecipientLocale, toLuxonLocale } from '@/lib/i18n/locale'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { commonError, zodError } from '@/lib/i18n/actionErrors'

const VALID_STATUSES: LessonStatus[] = ['scheduled', 'completed', 'no_show', 'cancelled']

/** How each refusal from `cancelLessonCore` reads to a staff user. */
const CANCEL_ERROR_MESSAGE: Record<CancellationError, string> = {
  not_found: 'validation.lessonNotFound',
  already_cancelled: 'lessons.errors.alreadyCancelled',
  already_delivered: 'lessons.errors.alreadyDelivered',
  not_eligible: 'lessons.errors.cancelFailed',
  forbidden: 'lessons.errors.noCancelPermission',
  no_students: 'lessons.errors.noLinkedStudents',
}

async function getLessonTeacherId(lessonId: string, orgId: string): Promise<string | null> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('lessons')
    .select('teacher_id')
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .maybeSingle()
  return (data?.teacher_id as string | null) ?? null
}

export type SetLessonStatusResult = {
  error: string | null
  chargeAlert?: string
}

export async function setLessonStatus(
  lessonId: string,
  _prevState: SetLessonStatusResult,
  formData: FormData
): Promise<SetLessonStatusResult> {
  const t = await getTranslations()
  const session = await getSession()
  try {
    requireMutation(session)
  } catch {
    return { error: await commonError('supportModeReadOnly') }
  }
  const { orgId, role } = session

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const status = formData.get('status') as LessonStatus
  const cancelReason = (formData.get('cancel_reason') as string) || undefined

  if (!status || !VALID_STATUSES.includes(status)) {
    return { error: t('lessons.errors.invalidStatus') }
  }

  // Cancelling from the status dropdown is the same act as cancelling from the
  // cancel panel, and it used to be a different one: it flipped the status and
  // charged nothing, in either billing mode. Same lesson, same policy, same
  // money — one path.
  if (status === 'cancelled') {
    const outcome = await cancelLessonCore({
      lessonId,
      orgId,
      actor: { kind: 'staff' },
      source: 'dashboard',
      reason: cancelReason,
    })

    if (!outcome.success) return { error: t(CANCEL_ERROR_MESSAGE[outcome.error]) }

    revalidatePath(`/lessons/${lessonId}`)
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    revalidatePath('/charges')
    revalidatePath('/billing')
    revalidatePath('/teacher/schedule')
    revalidatePath(`/teacher/schedule/${lessonId}`)

    return {
      error: null,
      chargeAlert: outcome.alerts[0] ? t(outcome.alerts[0].message) : undefined,
    }
  }

  try {
    // `cancelReason` is consumed by the cancelLessonCore branch above; only
    // delivery statuses reach here, and they carry no reason.
    await updateLessonStatus(lessonId, orgId, status)
    revalidatePath(`/lessons/${lessonId}`)
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    revalidatePath('/teacher/schedule')
    revalidatePath(`/teacher/schedule/${lessonId}`)
  } catch (e) {
    return { error: t('lessons.errors.statusUpdateFailed') }
  }

  // Automatic charge creation on completed
  if (status === 'completed') {
    const alert = await createLessonCharge(lessonId, orgId)
    if (alert) {
      return { error: null, chargeAlert: t(alert.message) }
    }
    // After the response: auto payment request if the org has it enabled.
    // autoSendPaymentRequest never throws.
    await runAfterResponse(autoSendPaymentRequest(lessonId, orgId))
  }

  return { error: null }
}

export type CancelLessonResult = {
  error: string | null
  chargeAlert?: string
}

/**
 * Cancels a lesson from the dashboard. Owner/admin may cancel any lesson and
 * may waive the fee; a teacher may cancel her own, always under the org policy.
 *
 * The rule itself lives in `cancelLessonCore` — this only resolves the actor and
 * renders the result.
 */
export async function cancelLesson(
  lessonId: string,
  _prevState: CancelLessonResult,
  formData: FormData
): Promise<CancelLessonResult> {
  const t = await getTranslations()
  const session = await getSession()
  try {
    requireMutation(session)
  } catch {
    return { error: await commonError('supportModeReadOnly') }
  }
  const { userId, orgId, role } = session

  const isStaff = role === 'owner' || role === 'admin'
  if (!isStaff && role !== 'teacher') {
    return { error: t('lessons.errors.noCancelPermission') }
  }

  const reason = (formData.get('cancel_reason') as string).trim()
  if (!reason) return { error: t('lessons.errors.reasonRequired') }

  let actor: CancellationActor
  if (isStaff) {
    actor = { kind: 'staff' }
  } else {
    const teacherRecord = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
    if (!teacherRecord) return { error: t('lessons.errors.noCancelPermission') }
    actor = { kind: 'teacher', teacherId: teacherRecord.id }
  }

  const outcome = await cancelLessonCore({
    lessonId,
    orgId,
    actor,
    source: isStaff ? 'dashboard' : 'teacher',
    reason,
    // Waiving the fee is a money decision, so it stays with owner/admin. A
    // teacher's cancellation always runs through the org's cancellation policy.
    waive: isStaff && formData.get('waive') === 'true',
  })

  if (!outcome.success) {
    return { error: t(CANCEL_ERROR_MESSAGE[outcome.error]) }
  }

  const chargeAlert = outcome.alerts[0] ? t(outcome.alerts[0].message) : undefined

  const teacherIdForNotice = await getLessonTeacherId(lessonId, orgId)

  // Fire-and-forget: in-app notification for lesson cancellation (Sprint 25 Story 4)
  void (async () => {
    try {
      const [ownerAdmins, teacherProfileId] = await Promise.all([
        getOwnerAndAdminProfileIds(orgId),
        teacherIdForNotice ? getTeacherProfileId(teacherIdForNotice) : Promise.resolve(null),
      ])
      const recipients = [...ownerAdmins]
      if (teacherProfileId && !recipients.includes(teacherProfileId)) {
        recipients.push(teacherProfileId)
      }
      await notifyMultiple(
        orgId,
        recipients,
        'lesson_cancelled',
        t('lessons.cancelledNotification', { reason }),
        undefined,
        `/lessons/${lessonId}`
      )
    } catch (err) {
      console.error('[cancelLesson] notification failed', { lessonId, err })
    }
  })()

  revalidatePath(`/lessons/${lessonId}`)
  revalidatePath('/lessons')
  revalidatePath('/dashboard')
  revalidatePath('/charges')
  revalidatePath('/billing')
  revalidatePath('/teacher/schedule')
  revalidatePath(`/teacher/schedule/${lessonId}`)

  return { error: null, chargeAlert }
}

export type CancelSeriesActionResult = {
  error: string | null
  removed?: number
  /** Occurrences left in place because they already happened or were charged. */
  kept?: number
}

/**
 * Stops a series from a required date (owner/admin only).
 * Planned occurrences are removed; lesson history is preserved.
 */
export async function cancelSeriesAction(
  lessonId: string,
  _prevState: CancelSeriesActionResult,
  formData: FormData
): Promise<CancelSeriesActionResult> {
  const t = await getTranslations()
  const session = await getSession()
  try {
    requireMutation(session)
  } catch {
    return { error: await commonError('supportModeReadOnly') }
  }
  const { orgId, role } = session

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const stopDateParsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get('stop_from_date'))
  if (!stopDateParsed.success) return { error: t('lessons.series.stopDateRequired') }

  const supabase = createServiceRoleClient()

  // Fetch series_id from the lesson (org-scoped).
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('series_id')
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .single()

  if (lessonError || !lesson) return { error: 'validation.lessonNotFound' }
  if (!lesson.series_id) return { error: t('lessons.errors.notInSeries') }

  try {
    const { removed, kept } = await stopLessonSeries(lesson.series_id, orgId, stopDateParsed.data)

    revalidatePath(`/lessons/${lessonId}`)
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    revalidatePath('/teacher/schedule')

    return { error: null, removed, kept }
  } catch (e) {
    return { error: t('lessons.errors.cancelSeriesFailed') }
  }
}

// ── Lesson notes ──────────────────────────────────────────────────────────────

export type AddNoteResult    = { error: string | null; success?: boolean }
export type DeleteNoteResult = { error: string | null }

const NoteSchema = z.object({ body: z.string().min(1).max(2000) })

export async function addLessonNote(
  lessonId: string,
  _prev: AddNoteResult,
  formData: FormData
): Promise<AddNoteResult> {
  const t = await getTranslations()
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (e) {
    return { error: await commonError('supportModeReadOnly') }
  }

  const parsed = NoteSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: t('lessons.errors.invalidNoteBody') }

  // Resolve teacherId — teachers use their own, owner/admin use a placeholder
  let teacherId: string | null = null
  if (session.role === 'teacher') {
    const teacher = await getTeacherByProfileId(session.profileId, session.orgId)
    if (!teacher) return { error: t('lessons.errors.noTeacherProfile') }

    // lessonId arrives from the client and createNote writes on a service-role
    // client, so nothing else establishes that this lesson is the teacher's.
    // Without this a teacher could file a note — including one with
    // visibleToParent, which surfaces in the family's portal — against any
    // colleague's lesson. deleteLessonNote below already checks ownership;
    // this branch was the oversight.
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const { data: ownLesson } = await createServiceRoleClient()
      .from('lessons')
      .select('id')
      .eq('id', lessonId)
      .eq('organization_id', session.orgId)
      .eq('teacher_id', teacher.id)
      .maybeSingle()
    if (!ownLesson) return { error: await commonError('noPermission') }

    teacherId = teacher.id
  } else {
    // owner/admin: find the teacher associated with this lesson
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const db = createServiceRoleClient()
    const { data: lesson } = await db
      .from('lessons')
      .select('teacher_id')
      .eq('id', lessonId)
      .eq('organization_id', session.orgId)
      .single()
    teacherId = (lesson as { teacher_id: string } | null)?.teacher_id ?? null
  }

  if (!teacherId) return { error: t('lessons.errors.cannotResolveTeacher') }

  try {
    await createNote({
      orgId: session.orgId,
      lessonId,
      teacherId,
      body: parsed.data.body,
      visibleToParent: formData.get('visibleToParent') === 'true',
    })
    revalidatePath(`/lessons/${lessonId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: t('lessons.errors.saveNoteFailed') }
  }
}

export async function deleteLessonNote(
  lessonId: string,
  _prev: DeleteNoteResult,
  formData: FormData
): Promise<DeleteNoteResult> {
  const t = await getTranslations()
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (e) {
    return { error: await commonError('supportModeReadOnly') }
  }

  const noteId = formData.get('noteId') as string | null
  if (!noteId) return { error: t('lessons.errors.noteIdMissing') }

  // Teachers can only delete their own notes; owner/admin can delete any
  let actorTeacherId: string | undefined
  if (session.role === 'teacher') {
    const teacher = await getTeacherByProfileId(session.profileId, session.orgId)
    actorTeacherId = teacher?.id
  }

  try {
    await deleteNote({ orgId: session.orgId, noteId, actorTeacherId })
    revalidatePath(`/lessons/${lessonId}`)
    return { error: null }
  } catch (e) {
    return { error: t('lessons.errors.deleteNoteFailed') }
  }
}

async function getOrgTimezone(orgId: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .single()
  return data?.timezone ?? 'Asia/Jerusalem'
}

export type SendReminderResult = { error: string | null }

/**
 * Sends a WhatsApp lesson reminder for a scheduled lesson, on demand.
 * Same message + notification_log semantics as the lesson-reminders cron,
 * so the hourly cron won't double-send for a lesson reminded manually.
 */
export async function sendLessonReminderAction(lessonId: string): Promise<SendReminderResult> {
  const t = await getTranslations()
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (e) {
    return { error: await commonError('supportModeReadOnly') }
  }

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_access_token, whatsapp_phone_number_id, timezone, default_locale')
    .eq('id', session.orgId)
    .single()

  if (!org?.whatsapp_access_token || !org?.whatsapp_phone_number_id) {
    return { error: t('lessons.errors.whatsappNotConnected') }
  }

  const { data: lesson } = await db
    .from('lessons')
    .select(
      `id, start_at, status,
       teachers ( profiles ( full_name ) ),
       lesson_students ( students ( full_name, relationships ( is_primary, parents ( phone, is_active, preferred_locale ) ) ) )`
    )
    .eq('id', lessonId)
    .eq('organization_id', session.orgId)
    .single()

  if (!lesson) return { error: 'validation.lessonNotFound' }
  if (lesson.status !== 'scheduled') {
    return { error: t('lessons.errors.reminderOnlyScheduled') }
  }
  // A past lesson still shows status 'scheduled' (nothing auto-completes
  // lessons), so guard on the clock too — otherwise this reminds a parent
  // about a lesson that already happened.
  if (DateTime.fromISO(lesson.start_at as string) <= DateTime.now()) {
    return { error: t('lessons.errors.reminderLessonPast') }
  }

  type LessonRow = {
    start_at: string
    teachers: { profiles: { full_name: string | null } | null } | null
    lesson_students: Array<{
      students: {
        full_name: string | null
        relationships: Array<{
          is_primary: boolean | null
          parents: {
            phone: string | null
            is_active: boolean | null
            preferred_locale: string | null
          } | null
        }> | null
      } | null
    }>
  }
  const row = lesson as unknown as LessonRow

  let parentPhone: string | null = null
  let parentLocale: string | null = null
  for (const ls of row.lesson_students ?? []) {
    for (const rel of ls.students?.relationships ?? []) {
      if (rel.is_primary && rel.parents?.is_active && rel.parents.phone) {
        parentPhone = rel.parents.phone
        parentLocale = rel.parents.preferred_locale
        break
      }
    }
    if (parentPhone) break
  }
  if (!parentPhone) return { error: t('lessons.errors.noPrimaryParentPhone') }

  const locale = resolveRecipientLocale({
    stored: parentLocale,
    orgDefault: org.default_locale as string | null,
  })
  const timezone = (org.timezone as string | null) ?? 'Asia/Jerusalem'
  const dt = DateTime.fromISO(row.start_at, { zone: 'utc' })
    .setZone(timezone)
    .setLocale(toLuxonLocale(locale))
  const teacherName = row.teachers?.profiles?.full_name ?? botString('the_teacher', locale)

  // sendSmartMessage, not sendTextMessage: a reminder is usually sent to a parent
  // who has not written to the business in 24h, and free text there fails with 131047.
  try {
    const result = await sendSmartMessage({
      orgId: session.orgId,
      phone: parentPhone,
      accessToken: decryptToken(org.whatsapp_access_token as string),
      phoneNumberId: org.whatsapp_phone_number_id as string,
      templateType: 'lesson_reminder',
      vars: {
        teacher_name: teacherName,
        date: dt.toFormat('cccc, d.M'),
        time: dt.toFormat('HH:mm'),
      },
      locale,
    })

    // Nothing was sent, so say so and write no notification_log row — otherwise
    // the button reports success and the hourly cron skips the lesson forever.
    if (!result.sent) {
      const tParents = await getTranslations('parents')
      return { error: tParents('optedOutError') }
    }
  } catch (e) {
    console.error('[lessons] Manual reminder send failed', { lessonId, error: e })
    return { error: t('lessons.errors.reminderSendFailed') }
  }

  // Dedup parity with the lesson-reminders cron (UNIQUE org+type+entity)
  await db.from('notification_log').upsert(
    {
      organization_id: session.orgId,
      type: 'lesson_reminder',
      entity_id: lessonId,
      status: 'sent',
      error_message: null,
      sent_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,type,entity_id' }
  )

  return { error: null }
}
