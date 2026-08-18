/**
 * Homework module — public API for queries and mutations.
 * Used by server actions and webhook handlers.
 *
 * Per /docs/sprint-14-scope.md § Story 2.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

// ── Types ─────────────────────────────────────────────────────────────────────

export type HomeworkTemplate = {
  id: string
  organizationId: string
  title: string
  subject: string | null
  body: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type HomeworkAssignment = {
  id: string
  organizationId: string
  teacherId: string
  studentId: string
  templateId: string | null
  title: string
  body: string
  dueDate: string | null   // YYYY-MM-DD
  status: 'pending' | 'done' | 'overdue'
  sentAt: string | null
  completedAt: string | null
  sendAt: string | null    // scheduled send time (Sprint 24)
  sent: boolean            // whether the assignment WhatsApp was sent (Sprint 24)
  createdAt: string
}

type TemplateRow = {
  id: string
  organization_id: string
  title: string
  subject: string | null
  body: string
  created_by: string
  created_at: string
  updated_at: string
}

function mapTemplate(row: TemplateRow): HomeworkTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    subject: row.subject,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

type AssignmentRow = {
  id: string
  organization_id: string
  teacher_id: string
  student_id: string
  template_id: string | null
  title: string
  body: string
  due_date: string | null
  status: 'pending' | 'done' | 'overdue'
  sent_at: string | null
  completed_at: string | null
  send_at: string | null
  sent: boolean
  created_at: string
}

function mapAssignment(row: AssignmentRow): HomeworkAssignment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    teacherId: row.teacher_id,
    studentId: row.student_id,
    templateId: row.template_id,
    title: row.title,
    body: row.body,
    dueDate: row.due_date,
    status: row.status,
    sentAt: row.sent_at,
    completedAt: row.completed_at,
    sendAt: row.send_at,
    sent: row.sent,
    createdAt: row.created_at,
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getTemplates(orgId: string): Promise<HomeworkTemplate[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`[homework] getTemplates failed: ${error.message}`)
  return (data ?? []).map((r) => mapTemplate(r as TemplateRow))
}

export async function getTemplate(
  orgId: string,
  templateId: string
): Promise<HomeworkTemplate | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_templates')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', templateId)
    .maybeSingle()

  if (error) throw new Error(`[homework] getTemplate failed: ${error.message}`)
  if (!data) return null
  return mapTemplate(data as TemplateRow)
}

export async function getAssignment(
  orgId: string,
  assignmentId: string
): Promise<(HomeworkAssignment & { studentName: string; teacherName: string }) | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_assignments')
    .select(`
      *,
      students ( full_name ),
      teachers ( profiles ( full_name ) )
    `)
    .eq('organization_id', orgId)
    .eq('id', assignmentId)
    .maybeSingle()

  if (error) throw new Error(`[homework] getAssignment failed: ${error.message}`)
  if (!data) return null

  const row = data as AssignmentRow & {
    students: { full_name: string } | null
    teachers: { profiles: { full_name: string } | null } | null
  }
  return {
    ...mapAssignment(row),
    studentName: row.students?.full_name ?? '',
    teacherName: (row.teachers?.profiles as { full_name: string } | null)?.full_name ?? '',
  }
}

export async function getAssignments(
  orgId: string,
  filters?: {
    studentId?: string
    teacherId?: string
    status?: 'pending' | 'done' | 'overdue'
  }
): Promise<(HomeworkAssignment & { studentName: string; teacherName: string })[]> {
  const db = createServiceRoleClient()

  let query = db
    .from('homework_assignments')
    .select(`
      *,
      students ( full_name ),
      teachers ( profiles ( full_name ) )
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (filters?.studentId) query = query.eq('student_id', filters.studentId)
  if (filters?.teacherId) query = query.eq('teacher_id', filters.teacherId)
  if (filters?.status)    query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw new Error(`[homework] getAssignments failed: ${error.message}`)

  return (data ?? []).map((r) => {
    const row = r as AssignmentRow & {
      students: { full_name: string } | null
      teachers: { profiles: { full_name: string } | null } | null
    }
    return {
      ...mapAssignment(row),
      studentName: row.students?.full_name ?? '',
      teacherName: (row.teachers?.profiles as { full_name: string } | null)?.full_name ?? '',
    }
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createTemplate(params: {
  orgId: string
  title: string
  subject?: string
  body: string
  createdBy: string
}): Promise<HomeworkTemplate> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_templates')
    .insert({
      organization_id: params.orgId,
      title:           params.title,
      subject:         params.subject ?? null,
      body:            params.body,
      created_by:      params.createdBy,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`[homework] createTemplate failed: ${error?.message}`)
  return mapTemplate(data as TemplateRow)
}

export async function updateTemplate(params: {
  orgId: string
  templateId: string
  title: string
  subject?: string
  body: string
}): Promise<HomeworkTemplate> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_templates')
    .update({
      title:      params.title,
      subject:    params.subject ?? null,
      body:       params.body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.templateId)
    .eq('organization_id', params.orgId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`[homework] updateTemplate failed: ${error?.message}`)
  return mapTemplate(data as TemplateRow)
}

export async function deleteTemplate(orgId: string, templateId: string): Promise<void> {
  const db = createServiceRoleClient()

  // Prevent orphaning: check for pending assignments referencing this template
  const { data: pending } = await db
    .from('homework_assignments')
    .select('id')
    .eq('template_id', templateId)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .limit(1)

  if (pending && pending.length > 0) {
    throw new Error('validation.templateHasOpenHomework')
  }

  const { error } = await db
    .from('homework_templates')
    .delete()
    .eq('id', templateId)
    .eq('organization_id', orgId)

  if (error) throw new Error(`[homework] deleteTemplate failed: ${error.message}`)
}

export async function createAssignment(params: {
  orgId: string
  teacherId: string
  studentIds: string[]
  templateId?: string
  title?: string
  body?: string
  dueDate?: string
  sendAt?: string   // ISO timestamp for scheduled send; null = send immediately
}): Promise<HomeworkAssignment[]> {
  const db = createServiceRoleClient()

  let resolvedTitle = params.title ?? ''
  let resolvedBody  = params.body ?? ''

  // If templateId provided, copy title + body from template (override submitted values)
  if (params.templateId) {
    const { data: tmpl, error: tmplError } = await db
      .from('homework_templates')
      .select('title, body')
      .eq('id', params.templateId)
      .eq('organization_id', params.orgId)
      .single()

    if (tmplError || !tmpl) {
      throw new Error(`[homework] Template not found: ${params.templateId}`)
    }
    const t = tmpl as { title: string; body: string }
    resolvedTitle = t.title
    resolvedBody  = t.body
  }

  if (!resolvedTitle || !resolvedBody) {
    throw new Error('[homework] title and body are required when no templateId is provided')
  }

  // Scheduled send: if sendAt is in the future, mark sent=false and don't send immediately.
  // homework-sender Edge Function will pick it up.
  const isScheduled = params.sendAt != null
  const rows = params.studentIds.map((studentId) => ({
    organization_id: params.orgId,
    teacher_id:      params.teacherId,
    student_id:      studentId,
    template_id:     params.templateId ?? null,
    title:           resolvedTitle,
    body:            resolvedBody,
    due_date:        params.dueDate ?? null,
    status:          'pending' as const,
    send_at:         params.sendAt ?? null,
    sent:            !isScheduled,  // immediately sent if no schedule
  }))

  const { data, error } = await db
    .from('homework_assignments')
    .insert(rows)
    .select('*')

  if (error || !data) throw new Error(`[homework] createAssignment failed: ${error?.message}`)
  return (data as AssignmentRow[]).map(mapAssignment)
}

export async function markAssignmentDone(params: {
  assignmentId: string
  organizationId: string
}): Promise<HomeworkAssignment> {
  const { assignmentId, organizationId } = params
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_assignments')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
    })
    .eq('id', assignmentId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`[homework] markAssignmentDone failed: ${error?.message}`)
  return mapAssignment(data as AssignmentRow)
}
