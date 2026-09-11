/**
 * Reads over saved broadcast lists (migration 20260911120000).
 *
 * Writes live in src/app/(dashboard)/messages/lists/actions.ts; this is what
 * the lists page and the broadcast composer read.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type BroadcastList = {
  id: string
  name: string
  memberIds: string[]
  memberCount: number
  updatedAt: string
}

/** A parent as the list editor shows them — enough to recognise and to warn. */
export type ListableParent = {
  id: string
  name: string
  phone: string | null
  optedOut: boolean
  studentNames: string[]
}

export async function getBroadcastLists(orgId: string): Promise<BroadcastList[]> {
  const db = createServiceRoleClient()

  const [{ data: lists, error }, { data: members }] = await Promise.all([
    db
      .from('broadcast_lists')
      .select('id, name, updated_at')
      .eq('organization_id', orgId)
      .order('name'),
    db.from('broadcast_list_members').select('list_id, parent_id').eq('organization_id', orgId),
  ])

  if (error) {
    // Before the migration reaches an environment the table does not exist.
    // An empty page is the honest answer there, not a crash.
    console.warn('[broadcast-lists] read failed', { orgId, error: error.message })
    return []
  }

  const byList = new Map<string, string[]>()
  for (const row of (members ?? []) as { list_id: string; parent_id: string }[]) {
    const ids = byList.get(row.list_id) ?? []
    ids.push(row.parent_id)
    byList.set(row.list_id, ids)
  }

  return ((lists ?? []) as { id: string; name: string; updated_at: string }[]).map((list) => {
    const memberIds = byList.get(list.id) ?? []
    return {
      id: list.id,
      name: list.name,
      memberIds,
      memberCount: memberIds.length,
      updatedAt: list.updated_at,
    }
  })
}

/** Every active parent in the org, with their children's names for searching. */
export async function getListableParents(orgId: string): Promise<ListableParent[]> {
  const db = createServiceRoleClient()

  const [{ data: parents }, { data: rels }] = await Promise.all([
    db
      .from('parents')
      .select('id, full_name, phone, opted_out_at')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('full_name'),
    db
      .from('relationships')
      .select('parent_id, students!inner(full_name)')
      .eq('organization_id', orgId),
  ])

  const childrenByParent = new Map<string, string[]>()
  for (const row of (rels ?? []) as unknown as {
    parent_id: string
    students: { full_name: string | null } | null
  }[]) {
    if (!row.students?.full_name) continue
    const names = childrenByParent.get(row.parent_id) ?? []
    names.push(row.students.full_name)
    childrenByParent.set(row.parent_id, names)
  }

  return ((parents ?? []) as {
    id: string
    full_name: string | null
    phone: string | null
    opted_out_at: string | null
  }[]).map((p) => ({
    id: p.id,
    name: p.full_name ?? p.phone ?? '',
    phone: p.phone,
    optedOut: p.opted_out_at !== null,
    studentNames: childrenByParent.get(p.id) ?? [],
  }))
}
