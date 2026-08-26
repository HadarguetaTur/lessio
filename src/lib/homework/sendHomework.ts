/**
 * sendHomeworkAssignment — sends a homework assignment via WhatsApp.
 * Per /docs/sprint-14-scope.md § Story 2 — sendHomework.ts.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { botString } from '@/lib/whatsapp/strings'
import { resolveRecipientLocale } from '@/lib/i18n/locale'

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
          parents ( phone, preferred_locale )
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
        parents: { phone: string | null; preferred_locale: string | null } | null
      }>
    } | null
  }

  const a = assignment as unknown as AssignmentData

  // 2. Resolve target phone: student phone → primary parent phone
  let targetPhone: string | null = a.students?.phone ?? null
  let parentLocale: string | null = null

  for (const rel of a.students?.relationships ?? []) {
    if (rel.is_primary && rel.parents?.phone) {
      targetPhone = targetPhone ?? rel.parents.phone
      parentLocale = rel.parents.preferred_locale
      break
    }
  }

  // 3. No phone → log + return false
  if (!targetPhone) {
    console.warn('[sendHomeworkAssignment] No phone found for assignment', { assignmentId, orgId })
    return false
  }

  // 4+5. Send via the org-customisable template (session-window aware)
  const { data: org } = await db
    .from('organizations')
    .select('default_locale')
    .eq('id', orgId)
    .maybeSingle()

  const locale = resolveRecipientLocale({
    stored: parentLocale,
    orgDefault: org?.default_locale as string | null | undefined,
  })

  try {
    await sendSmartMessage({
      orgId,
      phone: targetPhone,
      accessToken,
      phoneNumberId,
      templateType: 'homework_assignment',
      vars: {
        title: a.title,
        body: a.body,
        due_line: a.due_date ? `\n${botString('due_by', locale)}: ${a.due_date}` : '',
      },
      locale,
    })
  } catch (sendErr) {
    console.error('[sendHomeworkAssignment] WhatsApp send failed', {
      assignmentId,
      orgId,
      error: sendErr,
    })
    return false
  }

  // 6. Mark as sent.
  // Both columns, always: `sent_at` is the timestamp, `sent` is what the parent
  // portal filters on. Writing only one of them is what kept the portal's
  // homework tab permanently empty — every assignment sent from the dashboard
  // had a `sent_at` but `sent = false`.
  const { error: updateError } = await db
    .from('homework_assignments')
    .update({ sent_at: new Date().toISOString(), sent: true })
    .eq('id', assignmentId)
    .eq('organization_id', orgId)

  if (updateError) {
    console.error('[sendHomeworkAssignment] Failed to mark assignment sent', {
      assignmentId,
      error: updateError.message,
    })
  }

  return true
}
