/**
 * Portal messaging — teacher ↔ parent conversation threads per student.
 * Per /docs/sprint-26-scope.md § Story 4.
 *
 * All access via service role (RLS deny-all on portal_messages).
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type PortalMessage = {
  id: string
  organizationId: string
  studentId: string
  senderParentId: string | null
  senderProfileId: string | null
  body: string
  readAt: string | null
  createdAt: string
  // Joined fields
  senderName: string
  isFromParent: boolean
}

type MessageRow = {
  id: string
  organization_id: string
  student_id: string
  sender_parent_id: string | null
  sender_profile_id: string | null
  body: string
  read_at: string | null
  created_at: string
}

export async function getConversation(
  orgId: string,
  studentId: string,
  limit = 50
): Promise<PortalMessage[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('portal_messages')
    .select('*')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[portal/messages] getConversation failed', { error: error.message })
    return []
  }

  const rows = (data ?? []) as MessageRow[]

  // Resolve sender names
  const parentIds = [...new Set(rows.filter((r) => r.sender_parent_id).map((r) => r.sender_parent_id!))]
  const profileIds = [...new Set(rows.filter((r) => r.sender_profile_id).map((r) => r.sender_profile_id!))]

  const parentNameMap = new Map<string, string>()
  const profileNameMap = new Map<string, string>()

  if (parentIds.length > 0) {
    const { data: parents } = await db
      .from('parents')
      .select('id, full_name')
      .in('id', parentIds)
    for (const p of parents ?? []) {
      parentNameMap.set(p.id, (p as { id: string; full_name: string }).full_name)
    }
  }

  if (profileIds.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds)
    for (const p of profiles ?? []) {
      profileNameMap.set(p.id, (p as { id: string; full_name: string }).full_name)
    }
  }

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    studentId: row.student_id,
    senderParentId: row.sender_parent_id,
    senderProfileId: row.sender_profile_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
    senderName: row.sender_parent_id
      ? parentNameMap.get(row.sender_parent_id) ?? ''
      : profileNameMap.get(row.sender_profile_id!) ?? '',
    isFromParent: row.sender_parent_id != null,
  }))
}

export async function sendPortalMessage(params: {
  orgId: string
  studentId: string
  senderParentId?: string
  senderProfileId?: string
  body: string
}): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db.from('portal_messages').insert({
    organization_id: params.orgId,
    student_id: params.studentId,
    sender_parent_id: params.senderParentId ?? null,
    sender_profile_id: params.senderProfileId ?? null,
    body: params.body,
  })

  if (error) {
    throw new Error(`[portal/messages] sendPortalMessage failed: ${error.message}`)
  }
}

/**
 * Count unread messages for a parent (messages sent by teacher, not yet read).
 */
export async function getParentUnreadCount(orgId: string, parentId: string): Promise<number> {
  const db = createServiceRoleClient()

  // Get parent's student IDs
  const { data: rels } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', parentId)
    .eq('organization_id', orgId)

  const studentIds = (rels ?? []).map((r) => r.student_id)
  if (studentIds.length === 0) return 0

  const { count, error } = await db
    .from('portal_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('student_id', studentIds)
    .not('sender_profile_id', 'is', null)
    .is('read_at', null)

  if (error) {
    console.error('[portal/messages] getParentUnreadCount failed', { error: error.message })
    return 0
  }

  return count ?? 0
}

/**
 * Mark all teacher-sent messages as read for a student conversation.
 */
export async function markConversationRead(
  orgId: string,
  studentId: string
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .not('sender_profile_id', 'is', null)
    .is('read_at', null)

  if (error) {
    console.error('[portal/messages] markConversationRead failed', { error: error.message })
  }
}

/**
 * Get conversation summaries for all students a parent has — for the messages list.
 */
export async function getParentConversationSummaries(
  orgId: string,
  parentId: string
): Promise<Array<{
  studentId: string
  studentName: string
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}>> {
  const db = createServiceRoleClient()

  const { data: rels } = await db
    .from('relationships')
    .select('student_id, students ( full_name )')
    .eq('parent_id', parentId)
    .eq('organization_id', orgId)

  type RelRow = { student_id: string; students: { full_name: string } | null }
  const students = (rels ?? []).map((r) => {
    const row = r as unknown as RelRow
    return { id: row.student_id, name: row.students?.full_name ?? '' }
  })

  const summaries = []
  for (const student of students) {
    // Get last message
    const { data: lastMsg } = await db
      .from('portal_messages')
      .select('body, created_at')
      .eq('organization_id', orgId)
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(1)

    // Count unread (teacher → parent, not read)
    const { count } = await db
      .from('portal_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('student_id', student.id)
      .not('sender_profile_id', 'is', null)
      .is('read_at', null)

    const last = (lastMsg ?? [])[0] as { body: string; created_at: string } | undefined

    summaries.push({
      studentId: student.id,
      studentName: student.name,
      lastMessage: last?.body ?? '',
      lastMessageAt: last?.created_at ?? '',
      unreadCount: count ?? 0,
    })
  }

  // Most recent conversation first, threads with no messages last — otherwise
  // the order is whatever `relationships` happened to return, which changes
  // under the parent between visits.
  return summaries.sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
}

/**
 * Get dashboard conversation summaries — for teachers/owners to see all student threads.
 */
export async function getDashboardConversationSummaries(
  orgId: string
): Promise<Array<{
  studentId: string
  studentName: string
  parentName: string
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}>> {
  const db = createServiceRoleClient()

  // Get all students with messages
  const { data: msgStudents } = await db
    .from('portal_messages')
    .select('student_id')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  const studentIds = [...new Set((msgStudents ?? []).map((m) => (m as { student_id: string }).student_id))]
  if (studentIds.length === 0) return []

  // Get student names
  const { data: studentsData } = await db
    .from('students')
    .select('id, full_name')
    .in('id', studentIds)

  const studentNameMap = new Map<string, string>(
    (studentsData ?? []).map((s) => [(s as { id: string; full_name: string }).id, (s as { id: string; full_name: string }).full_name])
  )

  const summaries = []
  for (const studentId of studentIds) {
    // Last message
    const { data: lastMsg } = await db
      .from('portal_messages')
      .select('body, created_at, sender_parent_id')
      .eq('organization_id', orgId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)

    // Unread from parent (not yet read by teacher)
    const { count } = await db
      .from('portal_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('student_id', studentId)
      .not('sender_parent_id', 'is', null)
      .is('read_at', null)

    const last = (lastMsg ?? [])[0] as { body: string; created_at: string; sender_parent_id: string | null } | undefined

    // Get parent name from relationship
    const { data: rel } = await db
      .from('relationships')
      .select('parents ( full_name )')
      .eq('student_id', studentId)
      .eq('organization_id', orgId)
      .eq('is_primary', true)
      .limit(1)

    type RelNameRow = { parents: { full_name: string } | null }
    const parentName = (rel?.[0] as unknown as RelNameRow | undefined)?.parents?.full_name ?? ''

    summaries.push({
      studentId,
      studentName: studentNameMap.get(studentId) ?? '',
      parentName,
      lastMessage: last?.body ?? '',
      lastMessageAt: last?.created_at ?? '',
      unreadCount: count ?? 0,
    })
  }

  // Sort by last message time, most recent first
  summaries.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))

  return summaries
}
