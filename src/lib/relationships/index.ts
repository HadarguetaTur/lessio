import { createClient } from '@/lib/supabase/server'

export interface StudentParent {
  id: string
  is_primary: boolean
  created_at: string
  parent: {
    id: string
    full_name: string
    phone: string
  }
}

export interface ParentStudent {
  id: string
  is_primary: boolean
  created_at: string
  student: {
    id: string
    full_name: string
    grade: string | null
  }
}

export async function getStudentParents(
  studentId: string,
  organizationId: string
): Promise<StudentParent[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('relationships')
    .select('id, is_primary, created_at, parents(id, full_name, phone)')
    .eq('organization_id', organizationId)
    .eq('student_id', studentId)
    .order('is_primary', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((r) => ({
    id: r.id,
    is_primary: r.is_primary,
    created_at: r.created_at,
    parent: (r.parents as unknown) as { id: string; full_name: string; phone: string },
  }))
}

export async function getParentStudents(
  parentId: string,
  organizationId: string
): Promise<ParentStudent[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('relationships')
    .select('id, is_primary, created_at, students(id, full_name, grade)')
    .eq('organization_id', organizationId)
    .eq('parent_id', parentId)
    .order('is_primary', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((r) => ({
    id: r.id,
    is_primary: r.is_primary,
    created_at: r.created_at,
    student: (r.students as unknown) as { id: string; full_name: string; grade: string | null },
  }))
}

/** Returns active parents not yet linked to the given student. */
export async function getAvailableParentsForStudent(
  studentId: string,
  organizationId: string
): Promise<{ id: string; full_name: string; phone: string }[]> {
  const supabase = await createClient()

  // Get already-linked parent IDs
  const { data: linked } = await supabase
    .from('relationships')
    .select('parent_id')
    .eq('student_id', studentId)
    .eq('organization_id', organizationId)

  const linkedIds = (linked ?? []).map((r) => r.parent_id)

  let query = supabase
    .from('parents')
    .select('id, full_name, phone')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (linkedIds.length > 0) {
    query = query.not('id', 'in', `(${linkedIds.join(',')})`)
  }

  const { data } = await query
  return data ?? []
}
