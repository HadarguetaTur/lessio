'use server'

/**
 * Portal exam report action — a parent reports an upcoming exam for one of
 * their children: subject, title, description, date, optional file.
 */

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createExamReport, ExamReportSchema } from '@/lib/students/exams'
import { MAX_EXAM_FILE_SIZE } from '@/lib/students/examFiles'
import { completeExamReportFollowUp } from '@/lib/exams/postReport'
import { runAfterResponse } from '@/lib/server/afterResponse'

export type ReportExamState = { error: string | null; success?: boolean }

export async function reportExamAction(
  orgId: string,
  _prev: ReportExamState,
  formData: FormData
): Promise<ReportExamState> {
  const t = await getTranslations('portal.exams.errors')

  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) {
    return { error: t('unauthorized') }
  }

  const studentId = formData.get('studentId')
  if (typeof studentId !== 'string' || !studentId) {
    return { error: t('invalidInput') }
  }

  // Verify the parent owns this student — never trust the client-picked id
  const db = createServiceRoleClient()
  const { data: rel } = await db
    .from('relationships')
    .select('id')
    .eq('parent_id', session.parentId)
    .eq('student_id', studentId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!rel) return { error: t('notAllowedForStudent') }

  const parsed = ExamReportSchema.safeParse({
    studentId,
    subject: formData.get('subject'),
    title: formData.get('title'),
    description: (formData.get('description') as string | null) || null,
    examDate: formData.get('examDate'),
  })
  if (!parsed.success) {
    return { error: t('invalidInput') }
  }

  const file = formData.get('file') as File | null
  if (file && file.size > MAX_EXAM_FILE_SIZE) {
    return { error: t('fileTooLarge') }
  }

  try {
    const exam = await createExamReport({
      orgId,
      studentId,
      source: 'parent',
      reportedByParentId: session.parentId,
      input: parsed.data,
      file: file && file.size > 0 ? { file } : undefined,
    })

    revalidatePath(`/portal/${orgId}/exams`)

    // Keep independent follow-up work alive after the action returns. In tests
    // and other non-request contexts runAfterResponse awaits it inline.
    await runAfterResponse(completeExamReportFollowUp({ orgId, exam }))

    return { error: null, success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'validation.unsupportedFileType') return { error: t('unsupportedFileType') }
    if (msg === 'validation.fileTooLarge10') return { error: t('fileTooLarge') }
    return { error: t('submitFailed') }
  }
}
