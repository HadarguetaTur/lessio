/**
 * Student learning goals — CRUD.
 * Per /docs/sprint-24-scope.md § Story 4.
 *
 * Statuses: active | achieved | abandoned
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type GoalStatus = 'active' | 'achieved' | 'abandoned'

export type StudentGoal = {
  id: string
  organizationId: string
  studentId: string
  subject: string
  description: string
  targetDate: string | null   // YYYY-MM-DD
  status: GoalStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

type GoalRow = {
  id: string
  organization_id: string
  student_id: string
  subject: string
  description: string
  target_date: string | null
  status: GoalStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

function mapGoal(row: GoalRow): StudentGoal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    studentId: row.student_id,
    subject: row.subject,
    description: row.description,
    targetDate: row.target_date,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getGoalsForStudent(
  orgId: string,
  studentId: string
): Promise<StudentGoal[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_goals')
    .select('*')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`[goals] getGoalsForStudent failed: ${error.message}`)
  return (data ?? []).map((r) => mapGoal(r as GoalRow))
}

/**
 * Active goals across all students for a parent's children — used on portal home.
 */
export async function getActiveGoalsForStudents(
  orgId: string,
  studentIds: string[]
): Promise<(StudentGoal & { studentName: string })[]> {
  if (studentIds.length === 0) return []
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_goals')
    .select('*, students ( full_name )')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .in('student_id', studentIds)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw new Error(`[goals] getActiveGoalsForStudents failed: ${error.message}`)

  return (data ?? []).map((r) => {
    const row = r as GoalRow & { students: { full_name: string } | null }
    return {
      ...mapGoal(row),
      studentName: row.students?.full_name ?? '',
    }
  })
}

export async function createGoal(params: {
  orgId: string
  studentId: string
  createdBy: string
  subject: string
  description: string
  targetDate?: string
}): Promise<StudentGoal> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_goals')
    .insert({
      organization_id: params.orgId,
      student_id:      params.studentId,
      created_by:      params.createdBy,
      subject:         params.subject,
      description:     params.description,
      target_date:     params.targetDate ?? null,
      status:          'active',
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`[goals] createGoal failed: ${error?.message}`)
  return mapGoal(data as GoalRow)
}

export async function updateGoal(params: {
  orgId: string
  goalId: string
  subject?: string
  description?: string
  targetDate?: string | null
  status?: GoalStatus
}): Promise<StudentGoal> {
  const db = createServiceRoleClient()
  const updates: Partial<GoalRow> = { updated_at: new Date().toISOString() }
  if (params.subject     !== undefined) updates.subject     = params.subject
  if (params.description !== undefined) updates.description = params.description
  if (params.targetDate  !== undefined) updates.target_date = params.targetDate
  if (params.status      !== undefined) updates.status      = params.status

  const { data, error } = await db
    .from('student_goals')
    .update(updates)
    .eq('id', params.goalId)
    .eq('organization_id', params.orgId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`[goals] updateGoal failed: ${error?.message}`)
  return mapGoal(data as GoalRow)
}

export async function deleteGoal(orgId: string, goalId: string): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('student_goals')
    .delete()
    .eq('id', goalId)
    .eq('organization_id', orgId)

  if (error) throw new Error(`[goals] deleteGoal failed: ${error.message}`)
}
