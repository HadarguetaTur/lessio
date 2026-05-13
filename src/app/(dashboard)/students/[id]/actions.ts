'use server'

/**
 * Server actions for student profile page.
 * Goals CRUD. Per /docs/sprint-24-scope.md § Story 3 + 4.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DateTime } from 'luxon'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createGoal, updateGoal, deleteGoal } from '@/lib/goals'
import type { GoalStatus } from '@/lib/goals'
import { notifyMultiple, getOwnerAndAdminProfileIds, getTeacherProfileId } from '@/lib/notifications'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  createExam,
  updateExam,
  deleteExam,
  ExamCreateSchema,
  ExamUpdateSchema,
} from '@/lib/students/exams'
import {
  generateAndStoreProgressReport,
  renderProgressReportPdfBufferFromData,
} from '@/lib/students/generateProgressReportPdf'
import { buildProgressReportData } from '@/lib/students/progressReport'
import { getOrgTimezone } from '@/lib/organizations'
import { sendEmail, shouldSendEmail } from '@/lib/email'
import { progressReportEmail } from '@/lib/email/templates/progressReport'
import { parseAppLocale } from '@/lib/i18n/locale'

export type GoalActionState = { error: string | null; success?: boolean }

const GoalSchema = z.object({
  studentId:   z.string().uuid(),
  subject:     z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  targetDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).transform((v) => v || undefined),
})

export async function createGoalAction(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = GoalSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const { studentId, subject, description, targetDate } = parsed.data

  try {
    await createGoal({
      orgId: session.orgId,
      studentId,
      createdBy: session.profileId,
      subject,
      description,
      targetDate,
    })
    revalidatePath(`/students/${studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה ביצירת המטרה' }
  }
}

const UpdateStatusSchema = z.object({
  goalId:    z.string().uuid(),
  studentId: z.string().uuid(),
  status:    z.enum(['active', 'achieved', 'abandoned']),
})

export async function updateGoalStatusAction(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = UpdateStatusSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  const { goalId, studentId, status } = parsed.data

  try {
    await updateGoal({ orgId: session.orgId, goalId, status: status as GoalStatus })

    // Fire-and-forget: notify on goal achieved (Sprint 25 Story 4)
    if (status === 'achieved') {
      void (async () => {
        try {
          const db = createServiceRoleClient()
          const { data: goal } = await db
            .from('student_goals')
            .select('subject')
            .eq('id', goalId)
            .single()
          const subject = (goal as { subject: string } | null)?.subject ?? ''

          const { data: student } = await db
            .from('students')
            .select('teacher_id')
            .eq('id', studentId)
            .single()
          const teacherId = (student as { teacher_id: string | null } | null)?.teacher_id

          const [ownerAdmins, teacherProfileId] = await Promise.all([
            getOwnerAndAdminProfileIds(session.orgId),
            teacherId ? getTeacherProfileId(teacherId) : Promise.resolve(null),
          ])
          const recipients = [...ownerAdmins]
          if (teacherProfileId && !recipients.includes(teacherProfileId)) {
            recipients.push(teacherProfileId)
          }
          await notifyMultiple(
            session.orgId,
            recipients,
            'goal_achieved',
            `מטרה הושגה — ${subject}`,
            undefined,
            `/students/${studentId}?tab=notes`
          )
        } catch (err) {
          console.error('[goals] notification failed', { goalId, err })
        }
      })()
    }

    revalidatePath(`/students/${studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בעדכון המטרה' }
  }
}

const DeleteGoalSchema = z.object({
  goalId:    z.string().uuid(),
  studentId: z.string().uuid(),
})

export async function deleteGoalAction(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה' }
  }

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = DeleteGoalSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  try {
    await deleteGoal(session.orgId, parsed.data.goalId)
    revalidatePath(`/students/${parsed.data.studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה במחיקת המטרה' }
  }
}

// ─── Student exams (progress reports) ────────────────────────────────────────

export type ExamActionState = { error: string | null; success?: boolean }

function parseReportDates(
  fromDate: string,
  toDate: string,
  timezone: string
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(fromDate) || !dateRe.test(toDate)) {
    return { ok: false, error: 'תאריכים לא תקינים' }
  }
  const from = DateTime.fromISO(fromDate, { zone: timezone }).startOf('day')
  const to = DateTime.fromISO(toDate, { zone: timezone }).endOf('day')
  if (!from.isValid || !to.isValid || from > to) {
    return { ok: false, error: 'טווח תאריכים לא חוקי' }
  }
  const days = to.diff(from, 'days').days
  if (days > 366) {
    return { ok: false, error: 'טווח התאריכים לא יעלה על שנה' }
  }
  return { ok: true, from: fromDate, to: toDate }
}

export async function createExamAction(
  _prev: ExamActionState,
  formData: FormData
): Promise<ExamActionState> {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }
  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const raw = Object.fromEntries(formData)
  const parsed = ExamCreateSchema.safeParse({
    studentId: raw.studentId,
    subject: raw.subject,
    title: raw.title,
    examDate: raw.examDate,
    score: raw.score,
    maxScore: raw.maxScore === '' || raw.maxScore === undefined ? 100 : raw.maxScore,
    notes: raw.notes,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  try {
    await createExam({
      orgId: session.orgId,
      studentId: parsed.data.studentId,
      createdBy: session.profileId,
      input: parsed.data,
    })
    revalidatePath(`/students/${parsed.data.studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בשמירת המבחן' }
  }
}

const UpdateExamFormSchema = ExamUpdateSchema.extend({
  examId: z.string().uuid(),
  studentId: z.string().uuid(),
})

export async function updateExamAction(
  _prev: ExamActionState,
  formData: FormData
): Promise<ExamActionState> {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }
  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const raw = Object.fromEntries(formData)
  const parsed = UpdateExamFormSchema.safeParse({
    examId: raw.examId,
    studentId: raw.studentId,
    subject: raw.subject,
    title: raw.title,
    examDate: raw.examDate,
    score: raw.score,
    maxScore: raw.maxScore,
    notes: raw.notes,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const { examId, studentId, ...rest } = parsed.data
  try {
    await updateExam({ orgId: session.orgId, examId, input: rest })
    revalidatePath(`/students/${studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בעדכון המבחן' }
  }
}

const DeleteExamSchema = z.object({
  examId: z.string().uuid(),
  studentId: z.string().uuid(),
})

export async function deleteExamAction(
  _prev: ExamActionState,
  formData: FormData
): Promise<ExamActionState> {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }
  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = DeleteExamSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  try {
    await deleteExam(session.orgId, parsed.data.examId)
    revalidatePath(`/students/${parsed.data.studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה במחיקת המבחן' }
  }
}

// ─── Progress report PDF + email ─────────────────────────────────────────────

export type ProgressReportActionResult = {
  error: string | null
  signedUrl?: string
}

export async function generateProgressReportAction(
  studentId: string,
  fromDate: string,
  toDate: string
): Promise<ProgressReportActionResult> {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }
  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('organization_id', session.orgId)
    .maybeSingle()
  if (!row) return { error: 'תלמיד לא נמצא' }

  const timezone = await getOrgTimezone(session.orgId)
  const bounds = parseReportDates(fromDate, toDate, timezone)
  if (!bounds.ok) return { error: bounds.error }

  try {
    const { signedUrl } = await generateAndStoreProgressReport(
      studentId,
      session.orgId,
      bounds.from,
      bounds.to,
      timezone
    )
    return { error: null, signedUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה ביצירת הדוח' }
  }
}

export type SendProgressReportResult = { error: string | null; success?: boolean }

export async function sendProgressReportEmailAction(
  studentId: string,
  fromDate: string,
  toDate: string,
  recipientEmail: string,
  locale: string = 'he'
): Promise<SendProgressReportResult> {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }
  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const emailParsed = z.string().trim().email().safeParse(recipientEmail)
  if (!emailParsed.success) return { error: 'כתובת אימייל לא תקינה' }

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('organization_id', session.orgId)
    .maybeSingle()
  if (!row) return { error: 'תלמיד לא נמצא' }

  const canSend = await shouldSendEmail(session.orgId, 'progress_report', emailParsed.data)
  if (!canSend) {
    return {
      error:
        'שליחת דוח התקדמות במייל כבויה בהגדרות הארגון או שאין תצורת Resend. פנה למנהל.',
    }
  }

  const timezone = await getOrgTimezone(session.orgId)
  const bounds = parseReportDates(fromDate, toDate, timezone)
  if (!bounds.ok) return { error: bounds.error }

  const appLocale = parseAppLocale(locale)

  try {
    const data = await buildProgressReportData(studentId, session.orgId, bounds.from, bounds.to)
    const buffer = await renderProgressReportPdfBufferFromData(data, timezone)
    const safeName = data.student.name.replace(/[^\wא-ת\- ]+/g, '_').slice(0, 80)
    const filename = `progress-report-${safeName}-${bounds.from}-${bounds.to}.pdf`

    const attendanceSummary =
      appLocale === 'en'
        ? `Attendance: ${data.attendance.completed} / ${data.attendance.total} lessons (${data.attendance.ratePercent}% completed).`
        : `נוכחות: ${data.attendance.completed} / ${data.attendance.total} שיעורים (${data.attendance.ratePercent}% הושלמו).`

    const homeworkSummary =
      appLocale === 'en'
        ? `Homework: ${data.homework.completed} / ${data.homework.total} assignments${data.homework.avgScore != null ? ` (avg score ${data.homework.avgScore}/100)` : ''}.`
        : `שיעורי בית: ${data.homework.completed} / ${data.homework.total} משימות${data.homework.avgScore != null ? ` (ממוצע ציון ${data.homework.avgScore}/100)` : ''}.`

    const { subject, html } = progressReportEmail(
      {
        orgName: data.org.name,
        studentName: data.student.name,
        periodLabel: `${data.period.labelFrom} – ${data.period.labelTo}`,
        attendanceSummary,
        homeworkSummary,
      },
      appLocale === 'en' ? 'en' : 'he'
    )

    const ok = await sendEmail({
      orgId: session.orgId,
      to: emailParsed.data,
      subject,
      html,
      orgName: data.org.name,
      attachments: [
        {
          filename,
          content: buffer.toString('base64'),
        },
      ],
    })

    if (!ok) {
      return { error: 'שליחת המייל נכשלה. ודא ש-Resend מוגדר בשרת.' }
    }
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בשליחת הדוח' }
  }
}
