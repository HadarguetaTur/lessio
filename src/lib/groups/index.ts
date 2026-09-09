import { createClient } from '@/lib/supabase/server'

export interface StudentGroup {
  id: string
  name: string
  status: 'active' | 'paused'
  studentIds: string[]
  studentNames: string[]
  studentCount: number
  createdAt: string
  /**
   * The WhatsApp group this student group is linked to, if any.
   *
   * 'linked' means a group the teacher opened on their own phone, whose invite
   * link Lessio sends to parents. Meta's Groups API ('api') needs an Official
   * Business Account and is not built yet.
   */
  waGroupMode: 'none' | 'linked' | 'api'
  /** The code from https://chat.whatsapp.com/<code>, stored bare. */
  waInviteCode: string | null
  /** Parents already invited, so the card can say "5 of 7 invited". */
  waInvitedCount: number
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
      wa_group_mode,
      wa_invite_code,
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
      wa_group_mode,
      wa_invite_code,
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
    waGroupMode: (row.wa_group_mode as StudentGroup['waGroupMode']) ?? 'none',
    waInviteCode: row.wa_invite_code ?? null,
    // Filled by withInviteCounts where the screen needs it; a plain read of a
    // group does not pay for the extra query.
    waInvitedCount: 0,
  }
}

/**
 * Adds how many of each group's parents have already been invited to its
 * WhatsApp group.
 *
 * One query for the whole page rather than one per group, and only called from
 * the students screen — everywhere else the count is not shown.
 */
export async function withInviteCounts(
  orgId: string,
  groups: StudentGroup[]
): Promise<StudentGroup[]> {
  const linked = groups.filter((g) => g.waGroupMode !== 'none')
  if (linked.length === 0) return groups

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('student_group_invites')
    .select('group_id')
    .eq('organization_id', orgId)
    .in('group_id', linked.map((g) => g.id))

  if (error) return groups

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { group_id: string }[]) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1)
  }

  return groups.map((g) => ({ ...g, waInvitedCount: counts.get(g.id) ?? 0 }))
}
