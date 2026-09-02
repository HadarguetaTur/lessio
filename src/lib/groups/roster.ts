import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface GroupRoster {
  id: string
  name: string
  studentIds: string[]
}

/**
 * The current members of a student group, read server-side so a lesson built
 * from a group enrols exactly the group's roster rather than whatever list the
 * browser posted. Returns null when the group is not this org's or has no
 * members — a group lesson needs somebody to teach.
 */
export async function getGroupRosterServiceRole(
  orgId: string,
  groupId: string
): Promise<GroupRoster | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_groups')
    .select('id, name, student_group_members(student_id)')
    .eq('id', groupId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`getGroupRosterServiceRole: ${error.message}`)
  if (!data) return null

  const members = (data.student_group_members as { student_id: string }[] | null) ?? []
  const studentIds = [...new Set(members.map((m) => m.student_id))]
  if (studentIds.length === 0) return null

  return { id: data.id, name: data.name, studentIds }
}
