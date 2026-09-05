'use server'

/**
 * Server action: assign homework to one or more students.
 * Per /docs/sprint-14-scope.md § Story 4.
 */

import { revalidatePath } from 'next/cache'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { canAccessStudent } from '@/lib/auth/studentAccess'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createAssignment } from '@/lib/homework'
import { uploadAttachment } from '@/lib/homework/attachments'
import { sendHomeworkAssignment } from '@/lib/homework/sendHomework'
import { decryptToken } from '@/lib/crypto'
import { requireFeature } from '@/lib/saas/featureGate'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export type AssignActionState = {
  error: string | null
  success?: boolean
  count?: number
}

const AssignSchema = z
  .object({
    studentIds: z.array(z.string().uuid()).min(1, 'validation.pickAtLeastOneStudent'),
    templateId: z.string().uuid().optional(),
    title:      z.string().min(1).max(200).optional(),
    body:       z.string().min(1).max(2000).optional(),
    dueDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sendAt:     z.string().datetime().optional(),
  })
  .refine(
    (data) => data.templateId || (data.title && data.body),
    { message: 'validation.templateOrTitleBody' }
  )

export async function assignHomeworkAction(
  _prev: AssignActionState,
  formData: FormData
): Promise<AssignActionState> {
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, profileId, role } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'homework')

  const rawTemplateId = (formData.get('templateId') as string | null) ?? ''
  const rawSendAt = (formData.get('sendAt') as string | null) || undefined
  const raw = {
    studentIds: formData.getAll('studentIds').filter(Boolean) as string[],
    templateId: rawTemplateId !== '' ? rawTemplateId : undefined,
    title:      (formData.get('title') as string | null) || undefined,
    body:       (formData.get('body') as string | null) || undefined,
    dueDate:    (formData.get('dueDate') as string | null) || undefined,
    sendAt:     rawSendAt,
  }

  const parsed = AssignSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const { studentIds, templateId, title, body, dueDate, sendAt } = parsed.data

  // Resolve teacher: teacher from session, or first active teacher in org for owner/admin
  let teacherId: string
  if (role === 'teacher') {
    const teacher = await getTeacherByProfileId(profileId, orgId)
    if (!teacher) return { error: t('teacherSelf.errors.noTeacherProfile') }
    teacherId = teacher.id
  } else {
    // Known simplification: owner/admin assignments use the first active teacher in the org.
    // Sprint 17 will add a teacher selector to this form.
    const db = createServiceRoleClient()
    const { data: firstTeacher } = await db
      .from('teachers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!firstTeacher) return { error: t('homework.errors.noActiveTeachers') }
    teacherId = (firstTeacher as { id: string }).id
  }

  // The schema only proves these are UUIDs, and createAssignment writes with the
  // service-role client and then messages each student's parent on WhatsApp. Without
  // this check an id from another organization would put attacker-authored text in
  // front of that org's parent, and any teacher could assign across the whole org.
  for (const studentId of studentIds) {
    if (!(await canAccessStudent(session, studentId))) {
      return { error: t('lessons.newErrors.onlyOwnStudents') }
    }
  }

  // Create one assignment record per student
  let assignments: Awaited<ReturnType<typeof createAssignment>>
  try {
    assignments = await createAssignment({
      orgId,
      teacherId,
      studentIds,
      templateId,
      title: title as string | undefined,
      body:  body  as string | undefined,
      dueDate,
      sendAt,
    })
  } catch (err) {
    console.error('[homework/assign] createAssignment failed', { orgId, err })
    return { error: t('homework.errors.assignFailed') }
  }

  // Upload file attachments to each created assignment
  const files = formData.getAll('files') as File[]
  const validFiles = files.filter((f) => f instanceof File && f.size > 0)
  if (validFiles.length > 0) {
    for (const assignment of assignments) {
      for (const file of validFiles) {
        try {
          await uploadAttachment({
            orgId,
            assignmentId: assignment.id,
            uploadedBy: profileId,
            file,
          })
        } catch (err) {
          console.error('[homework/assign] File upload failed', {
            assignmentId: assignment.id,
            fileName: file.name,
            err,
          })
        }
      }
    }
  }

  // If scheduled, skip immediate WhatsApp send — homework-sender will handle it
  if (sendAt) {
    revalidatePath('/homework')
    return { error: null, success: true, count: assignments.length }
  }

  // Sent after the response, not fire-and-forget: the send must not block
  // or fail the assignment creation, but it must also outlive the lambda.
  const db = createServiceRoleClient()
  const { data: orgRow } = await db
    .from('organizations')
    .select('whatsapp_access_token, whatsapp_phone_number_id')
    .eq('id', orgId)
    .maybeSingle()

  type OrgWhatsApp = { whatsapp_access_token: string | null; whatsapp_phone_number_id: string | null }
  const org = orgRow as OrgWhatsApp | null

  if (org?.whatsapp_access_token && org?.whatsapp_phone_number_id) {
    let accessToken: string
    try {
      accessToken = decryptToken(org.whatsapp_access_token)
    } catch (err) {
      console.error('[homework/assign] Failed to decrypt WhatsApp token — skipping send', { orgId, err })
      revalidatePath('/homework')
      return { error: null, success: true, count: assignments.length }
    }

    const phoneNumberId = org.whatsapp_phone_number_id
    await runAfterResponse(
      Promise.all(
        assignments.map((assignment) =>
          sendHomeworkAssignment({
            orgId,
            assignmentId: assignment.id,
            accessToken,
            phoneNumberId,
          }).catch((err) => {
            console.error('[homework/assign] sendHomeworkAssignment failed', {
              assignmentId: assignment.id,
              orgId,
              err,
            })
          })
        )
      )
    )
  } else {
    console.warn('[homework/assign] No WhatsApp config — skipping send', { orgId })
  }

  revalidatePath('/homework')
  return { error: null, success: true, count: assignments.length }
}
