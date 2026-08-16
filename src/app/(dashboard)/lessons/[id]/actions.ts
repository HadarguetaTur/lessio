'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { updateLessonStatus, LessonStatus } from '@/lib/lessons'
import { createNote, deleteNote } from '@/lib/lessons/notes'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createLessonCharge, createCancellationCharge } from '@/lib/billing/createCharge'
import { getCancellationPolicy } from '@/lib/cancellation-policy'
import { calculateCancellationCharge } from '@/lib/billing/calculateCancellationCharge'
import { resolveBillingParent, MissingPrimaryParentError } from '@/lib/billing/resolveBillingParent'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { autoSendPaymentRequest } from '@/lib/payment-request/autoSend'
import { cancelLessonSeries, type CancelSeriesScope } from '@/lib/lessons/cancelSeries'
import { createCancellationEvent } from '@/lib/billing/monthly/cancellationEvents'
import { notifyMultiple, getOwnerAndAdminProfileIds, getTeacherProfileId } from '@/lib/notifications'
import { DateTime } from 'luxon'
import { decryptToken } from '@/lib/crypto'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { botString } from '@/lib/whatsapp/strings'
import { resolveRecipientLocale, toLuxonLocale } from '@/lib/i18n/locale'
import { sendTextMessage } from '@/lib/whatsapp'

const VALID_STATUSES: LessonStatus[] = ['scheduled', 'completed', 'no_show', 'cancelled']

export type SetLessonStatusResult = {
  error: string | null
  chargeAlert?: string
}

export async function setLessonStatus(
  lessonId: string,
  _prevState: SetLessonStatusResult,
  formData: FormData
): Promise<SetLessonStatusResult> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const status = formData.get('status') as LessonStatus
  const cancelReason = (formData.get('cancel_reason') as string) || undefined

  if (!status || !VALID_STATUSES.includes(status)) {
    return { error: 'יש לבחור סטטוס תקין' }
  }

  try {
    await updateLessonStatus(lessonId, orgId, status, cancelReason)
    revalidatePath(`/lessons/${lessonId}`)
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    revalidatePath('/teacher/schedule')
    revalidatePath(`/teacher/schedule/${lessonId}`)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בעדכון הסטטוס' }
  }

  // Automatic charge creation on completed
  if (status === 'completed') {
    const alert = await createLessonCharge(lessonId, orgId)
    if (alert) {
      return { error: null, chargeAlert: alert.message }
    }
    // Fire-and-forget: auto payment request if org has it enabled
    void autoSendPaymentRequest(lessonId, orgId)
  }

  return { error: null }
}

export type CancelLessonResult = {
  error: string | null
  chargeAlert?: string
}

/**
 * Cancels a lesson from the dashboard (owner/admin only).
 * Calculates charge via policy engine. Charge is skipped if waive=true.
 * Cannot cancel an already-cancelled lesson.
 */
export async function cancelLesson(
  lessonId: string,
  _prevState: CancelLessonResult,
  formData: FormData
): Promise<CancelLessonResult> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביטול שיעורים' }
  }

  const reason = (formData.get('cancel_reason') as string).trim()
  if (!reason) return { error: 'יש להזין סיבת ביטול' }

  const waive = formData.get('waive') === 'true'

  const supabase = createServiceRoleClient()

  // Fetch lesson with teacher hourly_rate; student resolved via lesson_students
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, start_at, end_at, status, lesson_students(student_id), teachers(id, hourly_rate)')
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .single()

  if (lessonError || !lesson) return { error: 'שיעור לא נמצא' }
  if (lesson.status === 'cancelled') return { error: 'השיעור כבר בוטל' }

  const lessonStudents = (lesson.lesson_students as Array<{ student_id: string }>)
  const primaryStudentId = lessonStudents[0]?.student_id

  // Determine charge
  let chargeAlert: string | undefined
  let cancellationParentId: string | null = null
  let pendingCancellationCharge:
    | ReturnType<typeof calculateCancellationCharge>
    | null = null

  if (!waive) {
    const policy = await getCancellationPolicy(orgId)
    const teacher = (lesson.teachers as unknown as { id: string; hourly_rate: number | null })

    const chargeResult = calculateCancellationCharge(
      { start_at: lesson.start_at, end_at: lesson.end_at, hourly_rate: teacher.hourly_rate },
      new Date(),
      policy
    )

    if (chargeResult.shouldCharge && chargeResult.amount > 0) {
      pendingCancellationCharge = chargeResult
      if (!primaryStudentId) {
        chargeAlert = 'לא ניתן ליצור חיוב ביטול — לשיעור אין תלמידים מקושרים'
      } else {
        try {
          cancellationParentId = await resolveBillingParent(primaryStudentId, orgId)
        } catch (e) {
          if (e instanceof MissingPrimaryParentError) {
            chargeAlert = 'לא ניתן ליצור חיוב ביטול — לתלמיד אין הורה ראשי מוגדר. יש לקשר הורה לתלמיד דרך עמוד התלמיד > הורים.'
          } else {
            chargeAlert = 'שגיאה ביצירת חיוב הביטול'
          }
        }
      }
    } else if (chargeResult.shouldCharge && chargeResult.reasonCode === 'missing_rate') {
      chargeAlert = 'לא ניתן ליצור חיוב ביטול — למורה אין תעריף שעתי מוגדר'
    }
  }

  // Update lesson status
  const { error: updateError } = await supabase
    .from('lessons')
    .update({ status: 'cancelled', cancel_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', lessonId)
    .eq('organization_id', orgId)

  if (updateError) return { error: 'שגיאה בביטול השיעור' }

  if (pendingCancellationCharge && cancellationParentId) {
    const alert = await createCancellationCharge(
      lessonId,
      orgId,
      cancellationParentId,
      pendingCancellationCharge
    )
    if (alert) chargeAlert = alert.message
  }

  // Create cancellation events for the monthly billing engine (all enrolled students).
  // Fire-and-forget: failures here must not block the cancellation response.
  const orgTz = await getOrgTimezone(orgId)
  for (const ls of lessonStudents) {
    createCancellationEvent({
      organizationId: orgId,
      lessonId,
      studentId: ls.student_id,
      lessonStartAt: lesson.start_at,
      timezone: orgTz,
    }).catch((err) =>
      console.error('[cancelLesson] cancellation event creation failed', { lessonId, studentId: ls.student_id, err })
    )
  }

  // Fire-and-forget: in-app notification for lesson cancellation (Sprint 25 Story 4)
  void (async () => {
    try {
      const teacher = lesson.teachers as unknown as { id: string }
      const [ownerAdmins, teacherProfileId] = await Promise.all([
        getOwnerAndAdminProfileIds(orgId),
        teacher?.id ? getTeacherProfileId(teacher.id) : Promise.resolve(null),
      ])
      const recipients = [...ownerAdmins]
      if (teacherProfileId && !recipients.includes(teacherProfileId)) {
        recipients.push(teacherProfileId)
      }
      await notifyMultiple(
        orgId,
        recipients,
        'lesson_cancelled',
        `שיעור בוטל — ${reason}`,
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
  cancelled?: number
}

/**
 * Cancels all or future lessons in a series (owner/admin only).
 * Does NOT auto-charge cancellation fees.
 */
export async function cancelSeriesAction(
  lessonId: string,
  _prevState: CancelSeriesActionResult,
  formData: FormData
): Promise<CancelSeriesActionResult> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const scope = formData.get('scope') as CancelSeriesScope
  if (scope !== 'all' && scope !== 'from_date') {
    return { error: 'scope לא תקין' }
  }

  const supabase = createServiceRoleClient()

  // Fetch series_id and start_at from the lesson (org-scoped)
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('series_id, start_at')
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .single()

  if (lessonError || !lesson) return { error: 'שיעור לא נמצא' }
  if (!lesson.series_id) return { error: 'שיעור זה אינו חלק מסדרה' }

  const fromDate =
    scope === 'from_date'
      ? new Date(lesson.start_at).toISOString().substring(0, 10)
      : undefined

  try {
    const { cancelled } = await cancelLessonSeries(
      lesson.series_id,
      orgId,
      scope,
      fromDate
    )

    revalidatePath(`/lessons/${lessonId}`)
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    revalidatePath('/teacher/schedule')

    return { error: null, cancelled }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בביטול הסדרה' }
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
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = NoteSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'תוכן ההערה אינו תקין' }

  // Resolve teacherId — teachers use their own, owner/admin use a placeholder
  let teacherId: string | null = null
  if (session.role === 'teacher') {
    const teacher = await getTeacherByProfileId(session.profileId, session.orgId)
    if (!teacher) return { error: 'לא נמצא פרופיל מורה' }
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

  if (!teacherId) return { error: 'לא ניתן לאתר את המורה של השיעור' }

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
    return { error: e instanceof Error ? e.message : 'שגיאה בשמירת ההערה' }
  }
}

export async function deleteLessonNote(
  lessonId: string,
  _prev: DeleteNoteResult,
  formData: FormData
): Promise<DeleteNoteResult> {
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const noteId = formData.get('noteId') as string | null
  if (!noteId) return { error: 'מזהה הערה חסר' }

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
    return { error: e instanceof Error ? e.message : 'שגיאה במחיקת ההערה' }
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
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_access_token, whatsapp_phone_number_id, timezone, default_locale')
    .eq('id', session.orgId)
    .single()

  if (!org?.whatsapp_access_token || !org?.whatsapp_phone_number_id) {
    return { error: 'WhatsApp לא מחובר — יש להתחבר בהגדרות' }
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

  if (!lesson) return { error: 'שיעור לא נמצא' }
  if (lesson.status !== 'scheduled') {
    return { error: 'ניתן לשלוח תזכורת רק לשיעור מתוכנן' }
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
  if (!parentPhone) return { error: 'לא נמצא הורה ראשי פעיל עם מספר טלפון' }

  const locale = resolveRecipientLocale({
    stored: parentLocale,
    orgDefault: org.default_locale as string | null,
  })
  const timezone = (org.timezone as string | null) ?? 'Asia/Jerusalem'
  const dt = DateTime.fromISO(row.start_at, { zone: 'utc' })
    .setZone(timezone)
    .setLocale(toLuxonLocale(locale))
  const teacherName = row.teachers?.profiles?.full_name ?? botString('the_teacher', locale)

  const body = await resolveTemplate(session.orgId, 'lesson_reminder', {
    teacher_name: teacherName,
    date: dt.toFormat("cccc, d.M"),
    time: dt.toFormat('HH:mm'),
  }, locale)

  try {
    await sendTextMessage(
      parentPhone,
      body,
      decryptToken(org.whatsapp_access_token as string),
      org.whatsapp_phone_number_id as string
    )
  } catch (e) {
    console.error('[lessons] Manual reminder send failed', { lessonId, error: e })
    return { error: 'שליחת התזכורת נכשלה' }
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
