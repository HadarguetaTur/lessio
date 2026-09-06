'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { requireQuotaCapacity } from '@/lib/saas/quota'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createLesson, LessonConflictError } from '@/lib/lessons/createLesson'
import { getGroupRosterServiceRole } from '@/lib/groups/roster'
import {
  buildAvailabilityNotice,
  type AvailabilityNotice,
} from '@/lib/availability/availabilityNotice'
import { checkLessonCalendarConflicts, CalendarConflict } from '@/lib/google-calendar/checkLessonCalendarConflicts'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'
import { isLessonDurationAllowed } from '@/lib/organizations/lessonDurations'
import { analyzeScheduleImpact, type ScheduleImpact } from '@/lib/scheduling/scheduleImpact'

const lessonStatusZ = z.enum(['scheduled', 'completed', 'cancelled', 'no_show'])

const IndividualLessonSchema = z.object({
  lesson_type:      z.literal('individual'),
  teacher_id:       z.string().uuid(),
  student_id:       z.string().uuid(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  status:           lessonStatusZ,
})

const GroupLessonSchema = z.object({
  lesson_type:      z.literal('group'),
  teacher_id:       z.string().uuid(),
  // The roster is resolved server-side from the group, never taken from the form.
  group_id:         z.string().uuid('validation.pickGroupWithStudent'),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  status:           lessonStatusZ,
  price_per_student: z.coerce.number().positive().optional().nullable(),
})

const PairLessonSchema = z.object({
  lesson_type:      z.literal('pair'),
  teacher_id:       z.string().uuid(),
  student_ids:      z
    .array(z.string().uuid())
    .length(2, 'validation.pairNeedsTwoStudents')
    .refine((ids) => new Set(ids).size === 2, 'validation.pairDistinctStudents'),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  status:           lessonStatusZ,
  // Optional: falls back to the org pair price.
  price_per_student: z.coerce.number().positive().optional().nullable(),
})

const CustomLessonSchema = z.object({
  lesson_type:      z.literal('custom'),
  teacher_id:       z.string().uuid(),
  student_ids:      z
    .array(z.string().uuid())
    .min(1, 'validation.atLeastOneStudent')
    .refine((ids) => new Set(ids).size === ids.length, 'validation.duplicateStudents'),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  // Free-form duration: the point of a custom lesson. Bounds match the importer.
  duration_minutes: z.coerce.number().int().min(5).max(480),
  status:           lessonStatusZ,
  // Required: a custom lesson has no org default to fall back on.
  price_per_student: z.coerce.number().positive('validation.customPriceRequired'),
})

/** Lesson types built from a roster of students rather than a single one. */
const MULTI_STUDENT_TYPES = ['pair', 'group', 'custom'] as const
type MultiStudentType = (typeof MULTI_STUDENT_TYPES)[number]

const MULTI_STUDENT_SCHEMAS = {
  pair: PairLessonSchema,
  group: GroupLessonSchema,
  custom: CustomLessonSchema,
} as const

export type NewLessonState = {
  error: string | null
  success?: boolean
  /**
   * Set when the requested slot is outside the teacher's availability windows.
   * The UI surfaces a confirmation dialog; resubmitting with
   * `confirm_outside_availability=1` skips the soft check.
   */
  needsAvailabilityConfirm?: boolean
  /**
   * What the teacher's availability actually says for that day, so the
   * confirmation dialog can show it instead of a bare "not available".
   */
  availabilityInfo?: AvailabilityNotice
  /**
   * Set when a Google Calendar event overlaps the requested slot.
   * The UI surfaces a warning dialog; resubmitting with
   * `confirm_calendar_conflict=1` skips the soft check.
   */
  needsCalendarConfirm?: boolean
  calendarConflicts?: CalendarConflict[]
  /** The lesson is legal, but would strand time too short for another lesson. */
  needsScheduleImpactConfirm?: boolean
  scheduleImpact?: ScheduleImpact
}

async function assertStudentsAssignedToTeacher(
  orgId: string,
  teacherId: string,
  studentIds: string[]
): Promise<string | null> {
  const t = await getTranslations()
  if (studentIds.length === 0) return await commonError('invalidData')
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('students')
    .select('id, teacher_id')
    .eq('organization_id', orgId)
    .in('id', studentIds)
  if (error) return t('lessons.newErrors.checkStudentsFailed')
  if (!data || data.length !== studentIds.length) return t('lessons.newErrors.studentNotFound')
  const bad = data.some((r) => r.teacher_id !== teacherId)
  if (bad) return t('lessons.newErrors.onlyOwnStudents')
  return null
}

export async function createLessonAction(
  _prev: NewLessonState,
  formData: FormData
): Promise<NewLessonState> {
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, role, profileId } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: await commonError('noPermission') }
  }
  await requireQuotaCapacity(orgId, 'lessons_monthly')

  // Explicit whitelist — anything unrecognised is treated as an individual
  // lesson rather than passed through to the DB.
  const rawType = String(formData.get('lesson_type') ?? '')
  const lessonType: 'individual' | MultiStudentType = (
    MULTI_STUDENT_TYPES as readonly string[]
  ).includes(rawType)
    ? (rawType as MultiStudentType)
    : 'individual'
  const confirmedOutsideAvailability =
    formData.get('confirm_outside_availability') === '1'
  const confirmedCalendarConflict =
    formData.get('confirm_calendar_conflict') === '1'
  const confirmedScheduleImpact =
    formData.get('confirm_schedule_impact') === '1'

  if (lessonType !== 'custom') {
    const requestedDuration = Number(formData.get('duration_minutes'))
    const audience = role === 'teacher' ? 'teacher' : 'admin'
    if (!(await isLessonDurationAllowed(orgId, audience, requestedDuration))) {
      return { error: await commonError('invalidData') }
    }
  }

  let lessonId: string

  try {
    if (role === 'teacher') {
      const teacher = await getTeacherByProfileId(profileId, orgId, { activeOnly: true })
      if (!teacher) return { error: t('lessons.newErrors.noTeacherProfile') }
      // Teachers create individual lessons only; multi-student types are an
      // admin/owner action, whatever the form posts.
      if (lessonType !== 'individual') {
        return { error: t('lessons.newErrors.groupAdminOnly') }
      }
      const parsed = IndividualLessonSchema.safeParse({
        lesson_type: 'individual',
        teacher_id: formData.get('teacher_id'),
        student_id: formData.get('student_id'),
        date: formData.get('date'),
        start_time: formData.get('start_time'),
        duration_minutes: formData.get('duration_minutes'),
        status: formData.get('status'),
      })
      if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

      const { teacher_id, student_id, date, start_time, duration_minutes, status } = parsed.data
      if (teacher_id !== teacher.id) return { error: await commonError('noPermission') }
      const assignErr = await assertStudentsAssignedToTeacher(orgId, teacher.id, [student_id])
      if (assignErr) return { error: assignErr }

      if (!confirmedOutsideAvailability && status === 'scheduled') {
        const avail = await assertWithinTeacherAvailability({
          orgId,
          teacherId: teacher_id,
          date,
          startTime: start_time,
          durationMinutes: duration_minutes,
          role,
        })
        if (avail) return avail
      }

      if (!confirmedScheduleImpact && status === 'scheduled') {
        const impact = await assertCompactSchedule({ orgId, teacherId: teacher_id, date, startTime: start_time, durationMinutes: duration_minutes, audience: 'teacher' })
        if (impact) return impact
      }
      if (!confirmedCalendarConflict && status === 'scheduled') {
        const cal = await assertNoCalendarConflicts({ orgId, teacherId: teacher_id, date, startTime: start_time, durationMinutes: duration_minutes })
        if (cal) return cal
      }

      const result = await createLesson({
        orgId,
        teacherId: teacher_id,
        studentIds: [student_id],
        lessonType: 'individual',
        date,
        startTime: start_time,
        durationMinutes: duration_minutes,
        createdByProfileId: profileId,
        status,
      })
      lessonId = result.lessonId
    } else if (lessonType !== 'individual') {
      // pair / group / custom all take a roster of students and a per-student
      // price; only their validation rules differ. A group lesson names its
      // group instead of a roster — the members are read here, not trusted
      // from the form.
      const rawPrice = formData.get('price_per_student')
      const parsed = MULTI_STUDENT_SCHEMAS[lessonType].safeParse({
        lesson_type: lessonType,
        teacher_id: formData.get('teacher_id'),
        student_ids: formData.getAll('student_ids').map(String).filter(Boolean),
        group_id: formData.get('group_id') || undefined,
        date: formData.get('date'),
        start_time: formData.get('start_time'),
        duration_minutes: formData.get('duration_minutes'),
        status: formData.get('status'),
        price_per_student: rawPrice && String(rawPrice).trim() ? rawPrice : null,
      })
      if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

      const { teacher_id, date, start_time, duration_minutes, status } = parsed.data
      const price_per_student = parsed.data.price_per_student ?? null

      let student_ids: string[]
      let group_id: string | null = null
      if (parsed.data.lesson_type === 'group') {
        const roster = await getGroupRosterServiceRole(orgId, parsed.data.group_id)
        if (!roster) return { error: t('validation.pickGroupWithStudent') }
        student_ids = roster.studentIds
        group_id = roster.id
      } else {
        student_ids = parsed.data.student_ids
      }

      if (!confirmedOutsideAvailability && status === 'scheduled') {
        const avail = await assertWithinTeacherAvailability({
          orgId,
          teacherId: teacher_id,
          date,
          startTime: start_time,
          durationMinutes: duration_minutes,
          role,
        })
        if (avail) return avail
      }

      if (!confirmedScheduleImpact && status === 'scheduled') {
        const impact = await assertCompactSchedule({ orgId, teacherId: teacher_id, date, startTime: start_time, durationMinutes: duration_minutes, audience: 'admin' })
        if (impact) return impact
      }
      if (!confirmedCalendarConflict && status === 'scheduled') {
        const cal = await assertNoCalendarConflicts({ orgId, teacherId: teacher_id, date, startTime: start_time, durationMinutes: duration_minutes })
        if (cal) return cal
      }

      const result = await createLesson({
        orgId,
        teacherId: teacher_id,
        studentIds: student_ids,
        lessonType,
        date,
        startTime: start_time,
        durationMinutes: duration_minutes,
        createdByProfileId: profileId,
        status,
        pricePerStudent: price_per_student,
        groupId: group_id,
      })
      lessonId = result.lessonId
    } else {
      const parsed = IndividualLessonSchema.safeParse({
        lesson_type: 'individual',
        teacher_id: formData.get('teacher_id'),
        student_id: formData.get('student_id'),
        date: formData.get('date'),
        start_time: formData.get('start_time'),
        duration_minutes: formData.get('duration_minutes'),
        status: formData.get('status'),
      })
      if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

      const { teacher_id, student_id, date, start_time, duration_minutes, status } = parsed.data

      if (!confirmedOutsideAvailability && status === 'scheduled') {
        const avail = await assertWithinTeacherAvailability({
          orgId,
          teacherId: teacher_id,
          date,
          startTime: start_time,
          durationMinutes: duration_minutes,
          role,
        })
        if (avail) return avail
      }

      if (!confirmedScheduleImpact && status === 'scheduled') {
        const impact = await assertCompactSchedule({ orgId, teacherId: teacher_id, date, startTime: start_time, durationMinutes: duration_minutes, audience: 'admin' })
        if (impact) return impact
      }
      if (!confirmedCalendarConflict && status === 'scheduled') {
        const cal = await assertNoCalendarConflicts({ orgId, teacherId: teacher_id, date, startTime: start_time, durationMinutes: duration_minutes })
        if (cal) return cal
      }

      const result = await createLesson({
        orgId,
        teacherId: teacher_id,
        studentIds: [student_id],
        lessonType: 'individual',
        date,
        startTime: start_time,
        durationMinutes: duration_minutes,
        createdByProfileId: profileId,
        status,
      })
      lessonId = result.lessonId
    }
  } catch (err) {
    if (err instanceof LessonConflictError) {
      const teacherConflict =
        role === 'teacher'
          ? t('lessons.conflicts.ownConflict')
          : t('lessons.conflicts.teacherConflict')
      const messages: Record<typeof err.reason, string> = {
        holiday:          t('lessons.conflicts.holiday'),
        teacher_conflict: teacherConflict,
        student_conflict: t('lessons.conflicts.studentConflict'),
        override_blocked: t('lessons.conflicts.overrideBlocked'),
      }
      return { error: messages[err.reason] }
    }
    return { error: t('lessons.newErrors.createFailed') }
  }

  const calendarFlow = formData.get('calendar_flow') === '1'
  if (calendarFlow) {
    // The calendar sheet keeps the user on the same page and just re-fetches.
    // Without explicit revalidation Next.js may serve a cached payload and the
    // new lesson appears to be missing from the grid.
    revalidatePath('/lessons')
    revalidatePath('/teacher/schedule')
    return { error: null, success: true }
  }

  if (role === 'teacher') {
    redirect(`/teacher/schedule/${lessonId}`)
  }
  redirect(`/lessons/${lessonId}`)
}

async function assertCompactSchedule(params: Parameters<typeof analyzeScheduleImpact>[0]): Promise<NewLessonState | null> {
  const impact = await analyzeScheduleImpact(params)
  if (!impact) return null
  const t = await getTranslations()
  return {
    error: t('lessons.scheduleImpact.description'),
    needsScheduleImpactConfirm: true,
    scheduleImpact: impact,
  }
}

/**
 * Helper: returns a `NewLessonState` describing Google Calendar conflicts, or
 * null when no conflicts are found (or no calendars are connected).
 */
async function assertNoCalendarConflicts(params: {
  orgId:           string
  teacherId:       string
  date:            string
  startTime:       string
  durationMinutes: number
}): Promise<NewLessonState | null> {
  const t = await getTranslations()
  const conflicts = await checkLessonCalendarConflicts(params)
  if (conflicts.length === 0) return null
  return {
    error: t('lessons.conflicts.googleCalendar'),
    needsCalendarConfirm: true,
    calendarConflicts: conflicts,
  }
}

/**
 * Helper: returns a `NewLessonState` describing the availability conflict, or
 * null when the slot fits inside the teacher's availability. Used by every
 * branch of `createLessonAction` before persisting.
 *
 * The wording and the "here is what your availability actually says" payload
 * live in `buildAvailabilityNotice`, shared with the teacher's own route.
 */
async function assertWithinTeacherAvailability(params: {
  orgId: string
  teacherId: string
  date: string
  startTime: string
  durationMinutes: number
  role: string
}): Promise<NewLessonState | null> {
  const built = await buildAvailabilityNotice(params)
  if (!built) return null

  return {
    error: built.message,
    needsAvailabilityConfirm: true,
    availabilityInfo: built.notice,
  }
}
