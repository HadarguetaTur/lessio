/**
 * sendHomeworkAssignment — sends a homework assignment via WhatsApp.
 * Per /docs/sprint-14-scope.md § Story 2 — sendHomework.ts.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendTextMessage } from '@/lib/whatsapp'

export async function sendHomeworkAssignment(params: {
  orgId: string
  assignmentId: string
  accessToken: string
  phoneNumberId: string
}): Promise<boolean> {
  const { orgId, assignmentId, accessToken, phoneNumberId } = params
  const db = createServiceRoleClient()

  // 1. Load assignment with student + primary parent
  const { data: assignment, error } = await db
    .from('homework_assignments')
    .select(`
      id, title, body, due_date,
      students (
        phone,
        relationships (
          is_primary,
          parents ( phone )
        )
      )
    `)
    .eq('id', assignmentId)
    .eq('organization_id', orgId)
    .single()

  if (error || !assignment) {
    console.warn('[sendHomeworkAssignment] Assignment not found', { assignmentId, orgId })
    return false
  }

  type AssignmentData = {
    id: string
    title: string
    body: string
    due_date: string | null
    students: {
      phone: string | null
      relationships: Array<{
        is_primary: boolean
        parents: { phone: string | null } | null
      }>
    } | null
  }

  const a = assignment as unknown as AssignmentData

  // 2. Resolve target phone: student phone → primary parent phone
  let targetPhone: string | null = a.students?.phone ?? null

  if (!targetPhone) {
    for (const rel of a.students?.relationships ?? []) {
      if (rel.is_primary && rel.parents?.phone) {
        targetPhone = rel.parents.phone
        break
      }
    }
  }

  // 3. No phone → log + return false
  if (!targetPhone) {
    console.warn('[sendHomeworkAssignment] No phone found for assignment', { assignmentId, orgId })
    return false
  }

  // 4. Build message
  let message = `שיעורי בית: ${a.title}\n\n${a.body}`
  if (a.due_date) {
    message += `\n\nתאריך הגשה: ${a.due_date}`
  }

  // 5. Send via WhatsApp
  try {
    await sendTextMessage(targetPhone, message, accessToken, phoneNumberId)
  } catch (sendErr) {
    console.error('[sendHomeworkAssignment] WhatsApp send failed', {
      assignmentId,
      orgId,
      error: sendErr,
    })
    return false
  }

  // 6. Update sent_at
  const { error: updateError } = await db
    .from('homework_assignments')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', assignmentId)

  if (updateError) {
    console.error('[sendHomeworkAssignment] Failed to update sent_at', {
      assignmentId,
      error: updateError.message,
    })
  }

  return true
}
