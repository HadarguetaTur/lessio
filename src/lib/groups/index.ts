import { createClient } from '@/lib/supabase/server'

export interface StudentGroup {
  id: string
  name: string
  status: 'active' | 'paused'
  studentIds: string[]
  studentNames: string[]
  studentCount: number
  createdAt: string
}

export interface GetGroupsOptions {
  status?: 'active' | 'paused'
}

export async function getGroups(
  orgId: string,
  opts: GetGroupsOptions = {}
): Promise<StudentGroup[]> {
  const supabase = await createClient()

  let query = supabase
    .from('student_groups')
    .select(`
      id,
      name,
      status,
      created_at,
      student_group_members (
        student_id,
        students ( id, full_name )
      )
    `)
    .eq('organization_id', orgId)
    .order('name')

  if (opts.status) {
    query = query.eq('status', opts.status)
  }

  const { data, error } = await query
  if (error) throw new Error(`getGroups: ${error.message}`)

  return (data ?? []).map(mapGroup)
}

export async function getGroupById(
  id: string,
  orgId: string
): Promise<StudentGroup | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('student_groups')
    .select(`
      id,
      name,
      status,
      created_at,
      student_group_members (
        student_id,
        students ( id, full_name )
      )
    `)
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (error) return null
  return mapGroup(data)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGroup(row: any): StudentGroup {
  const members: { student_id: string; students: { id: string; full_name: string } | null }[] =
    row.student_group_members ?? []

  const studentIds = members.map((m) => m.student_id)
  const studentNames = members
    .map((m) => m.students?.full_name ?? '')
    .filter(Boolean)

  return {
    id: row.id,
    name: row.name,
    status: row.status as 'active' | 'paused',
    studentIds,
    studentNames,
    studentCount: studentIds.length,
    createdAt: row.created_at,
  }
}
