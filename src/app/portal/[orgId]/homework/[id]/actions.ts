'use server'

/**
 * Portal homework submission action.
 * Per /docs/sprint-24-scope.md § Story 1.
 */

import { revalidatePath } from 'next/cache'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { submitHomework } from '@/lib/homework/submissions'
import { createNotification, getTeacherProfileId } from '@/lib/notifications'

export type SubmitActionState = { error: string | null; success?: boolean }

export async function submitHomeworkAction(
  orgId: string,
  assignmentId: string,
  _prev: SubmitActionState,
  formData: FormData
): Promise<SubmitActionState> {
  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) {
    return { error: 'אין הרשאה' }
  }

  // Resolve student from parent → relationships → check assignment belongs to student
  const db = createServiceRoleClient()
  const { data: assignment } = await db
    .from('homework_assignments')
    .select('student_id')
    .eq('id', assignmentId)
    .eq('organization_id', orgId)
    .single()

  if (!assignment) return { error: 'שיעורי בית לא נמצאו' }

  // Verify parent owns this student
  const { data: rel } = await db
    .from('relationships')
    .select('id')
    .eq('parent_id', session.parentId)
    .eq('student_id', (assignment as { student_id: string }).student_id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!rel) return { error: 'אין הרשאה להגיש עבור תלמיד זה' }

  const note = (formData.get('note') as string | null) ?? undefined
  const file = formData.get('file') as File | null

  try {
    await submitHomework({
      orgId,
      assignmentId,
      studentId: (assignment as { student_id: string }).student_id,
      note,
      file: file && file.size > 0 ? file : undefined,
    })

    revalidatePath(`/portal/${orgId}/homework/${assignmentId}`)
    revalidatePath(`/portal/${orgId}/homework`)

    // Fire-and-forget: notify teacher of homework submission (Sprint 25 Story 4)
    void (async () => {
      try {
        const { data: hw } = await db
          .from('homework_assignments')
          .select('title, teacher_id')
          .eq('id', assignmentId)
          .single()
        if (!hw) return
        const assignmentRow = hw as { title: string; teacher_id: string | null }
        if (!assignmentRow.teacher_id) return
        const teacherProfileId = await getTeacherProfileId(assignmentRow.teacher_id)
        if (!teacherProfileId) return
        await createNotification({
          orgId,
          recipientProfileId: teacherProfileId,
          type: 'homework_submitted',
          title: `שיעורי בית הוגשו — ${assignmentRow.title}`,
          actionUrl: `/homework/${assignmentId}`,
        })
      } catch (err) {
        console.error('[portal/homework] notification failed', { assignmentId, err })
      }
    })()

    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בהגשת שיעורי הבית' }
  }
}
