import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface Parent {
  id: string
  full_name: string
  phone: string
  email: string | null
  second_phone: string | null
  address: string | null
  relation_type: string | null
  notes: string | null
  is_active: boolean
  /** Set when the parent replied STOP on WhatsApp — blocks business-initiated sends. */
  opted_out_at: string | null
  /** How consent to WhatsApp messaging was obtained; null = no evidence on file. */
  consent_source: ConsentSource | null
  consented_at: string | null
  /** When the one-time welcome notice went out; null = next business send is preceded by it. */
  welcome_sent_at: string | null
  created_at: string
}

export type ConsentSource = 'attested' | 'import' | 'portal' | 'booking' | 'whatsapp_reply'

const PARENT_COLUMNS =
  'id, full_name, phone, email, second_phone, address, relation_type, notes, is_active, opted_out_at, consent_source, consented_at, welcome_sent_at, created_at'

export interface GetParentsOptions {
  search?: string
  /** Filter to the families of students this teacher may see. See teacherStudentIds. */
  teacherId?: string
}

/**
 * The student ids a teacher may see, by the same rule as
 * canTeacherAccessStudent: assigned via students.teacher_id, or sharing a
 * lesson — which is how a group or a covered lesson reaches a student assigned
 * to someone else.
 *
 * Restated here rather than imported so the parents module does not depend on
 * the students module; if the rule there changes, change it here too.
 */
async function teacherStudentIds(
  organizationId: string,
  teacherId: string
): Promise<string[]> {
  const supabase = createServiceRoleClient()

  const [assigned, viaLesson] = await Promise.all([
    supabase
      .from('students')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('teacher_id', teacherId),
    supabase
      .from('lesson_students')
      .select('student_id, lessons!inner(teacher_id, organization_id)')
      .eq('lessons.teacher_id', teacherId)
      .eq('lessons.organization_id', organizationId),
  ])

  const ids = new Set<string>()
  for (const row of assigned.data ?? []) ids.add(row.id)
  for (const row of viaLesson.data ?? []) ids.add(row.student_id)
  return [...ids]
}

/** The parent ids linked to any of these students. */
async function parentIdsForStudents(
  organizationId: string,
  studentIds: string[]
): Promise<string[]> {
  if (studentIds.length === 0) return []
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('relationships')
    .select('parent_id')
    .eq('organization_id', organizationId)
    .in('student_id', studentIds)
  return [...new Set((data ?? []).map((r) => r.parent_id))]
}

/**
 * Whether a teacher may open a specific parent.
 *
 * The list is scoped, but /parents/[id]/edit is reachable by id — global
 * search links straight to it — so the same rule has to guard the by-id read.
 */
export async function canTeacherAccessParent(
  organizationId: string,
  teacherId: string,
  parentId: string
): Promise<boolean> {
  const studentIds = await teacherStudentIds(organizationId, teacherId)
  const parentIds = await parentIdsForStudents(organizationId, studentIds)
  return parentIds.includes(parentId)
}

export async function getParents(
  organizationId: string,
  options: GetParentsOptions = {}
): Promise<Parent[]> {
  const supabase = createServiceRoleClient()

  // A teacher's sidebar calls this page "ההורים שלי", and it used to list every
  // family in the org with their phone numbers — while the sibling students
  // page scoped correctly (UX audit F4).
  let allowedParentIds: string[] | null = null
  if (options.teacherId) {
    const studentIds = await teacherStudentIds(organizationId, options.teacherId)
    allowedParentIds = await parentIdsForStudents(organizationId, studentIds)
    if (allowedParentIds.length === 0) return []
  }

  let query = supabase
    .from('parents')
    .select(PARENT_COLUMNS)
    .eq('organization_id', organizationId)
    .order('full_name', { ascending: true })

  if (allowedParentIds) {
    query = query.in('id', allowedParentIds)
  }

  if (options.search) {
    // Search by name or phone
    query = query.or(
      `full_name.ilike.%${options.search}%,phone.ilike.%${options.search}%`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getParentById(
  id: string,
  organizationId: string
): Promise<Parent | null> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('parents')
    .select(PARENT_COLUMNS)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  return data ?? null
}
