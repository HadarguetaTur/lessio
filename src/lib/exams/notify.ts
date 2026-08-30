/**
 * Exam report notifications — pings the student's teacher (fallback:
 * owner/admin) when a parent or student reports an exam.
 *
 * In-app is the guaranteed channel; WhatsApp to the teacher is best-effort
 * (fails silently outside the 24h session window). Fire-and-forget: never
 * throws.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  notifyMultiple,
  getOwnerAndAdminProfileIds,
  getTeacherProfileId,
} from '@/lib/notifications'
import { decryptToken } from '@/lib/crypto'
import { sendTextMessage } from '@/lib/whatsapp'
import { botString } from '@/lib/whatsapp/strings'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import type { StudentExam } from '@/lib/students/exams'

export async function notifyExamReported(params: {
  orgId: string
  exam: StudentExam
}): Promise<void> {
  const { orgId, exam } = params
  try {
    const db = createServiceRoleClient()

    const [{ data: studentRow }, { data: orgRow }] = await Promise.all([
      db
        .from('students')
        .select('full_name, teacher_id')
        .eq('id', exam.studentId)
        .eq('organization_id', orgId)
        .maybeSingle(),
      db
        .from('organizations')
        .select('default_locale, whatsapp_access_token, whatsapp_phone_number_id')
        .eq('id', orgId)
        .maybeSingle(),
    ])

    const studentName = (studentRow as { full_name: string } | null)?.full_name ?? ''
    const teacherId = (studentRow as { teacher_id: string | null } | null)?.teacher_id ?? null

    // Recipients: the student's teacher when one is assigned, owners/admins always
    const teacherProfileId = teacherId ? await getTeacherProfileId(teacherId) : null
    const staffIds = await getOwnerAndAdminProfileIds(orgId)
    const recipients = [...new Set([teacherProfileId, ...staffIds].filter((v): v is string => !!v))]
    if (recipients.length === 0) return

    const orgLocale = parseAppLocale(
      (orgRow as { default_locale: string | null } | null)?.default_locale ?? undefined
    )
    const tn = await getT('notifications', orgLocale)
    await notifyMultiple(
      orgId,
      recipients,
      'exam_reported',
      tn('examReported', { student: studentName }),
      tn('examReportedBody', { subject: exam.subject, title: exam.title, date: exam.examDate }),
      `/students/${exam.studentId}?tab=exams`
    )

    // Best-effort WhatsApp to the teacher only (staff get the in-app one)
    await sendTeacherWhatsApp({ orgId, exam, studentName, teacherId, orgRow })
  } catch (err) {
    console.error('[exams/notify] notifyExamReported failed', { orgId, examId: exam.id, err })
  }
}

async function sendTeacherWhatsApp(params: {
  orgId: string
  exam: StudentExam
  studentName: string
  teacherId: string | null
  orgRow: unknown
}): Promise<void> {
  const { orgId, exam, studentName, teacherId } = params
  const org = params.orgRow as {
    whatsapp_access_token: string | null
    whatsapp_phone_number_id: string | null
  } | null

  if (!teacherId || !org?.whatsapp_access_token || !org?.whatsapp_phone_number_id) return

  try {
    const db = createServiceRoleClient()
    const { data: teacherRow } = await db
      .from('teachers')
      .select('profiles ( phone, preferred_locale )')
      .eq('id', teacherId)
      .maybeSingle()

    const profile = (teacherRow as unknown as {
      profiles: { phone: string | null; preferred_locale: string | null } | null
    } | null)?.profiles
    if (!profile?.phone) return

    const accessToken = decryptToken(org.whatsapp_access_token)
    const locale = parseAppLocale(profile.preferred_locale ?? undefined)
    await sendTextMessage(
      profile.phone,
      botString('teacher_exam_reported_alert', locale, {
        student_name: studentName,
        subject: exam.subject,
        title: exam.title,
        exam_date: exam.examDate,
      }),
      accessToken,
      org.whatsapp_phone_number_id
    )
  } catch (err) {
    // Expected when the teacher's 24h window is closed — in-app is the guarantee
    console.warn('[exams/notify] Teacher WhatsApp alert failed — in-app notification still sent', {
      orgId,
      examId: exam.id,
      error: String(err),
    })
  }
}
