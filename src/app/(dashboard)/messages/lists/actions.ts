'use server'

/**
 * Saved broadcast lists — create, edit, delete.
 *
 * Owner and admin only, like every broadcast tool. The plan gate uses
 * assertFeature rather than requireFeature: these run from a sheet the owner
 * has just filled in, and a redirect to billing would throw away the names she
 * picked. Parent ids arrive from the client, so every write re-reads them
 * against the org before storing — a list can never hold another tenant's
 * parent, whatever the form submitted.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { assertFeature, FeatureNotAvailableError } from '@/lib/saas/featureGate'
import { mutationBlockedError } from '@/lib/i18n/actionErrors'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getTranslations } from 'next-intl/server'

export type ListActionResult = { error: string | null; listId?: string }

const ListSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentIds: z.array(z.string().uuid()).max(2000),
})

const ListIdSchema = z.string().uuid()

type Guarded =
  | { ok: true; orgId: string; profileId: string }
  | { ok: false; error: string }

/** The checks every list action shares, in the order that matters. */
async function guard(): Promise<Guarded> {
  const session = await getSession()
  try {
    requireMutation(session)
  } catch (err) {
    return { ok: false, error: await mutationBlockedError(err) }
  }

  const t = await getTranslations('inbox.lists.errors')
  if (session.role !== 'owner' && session.role !== 'admin') return { ok: false, error: t('forbidden') }

  try {
    await assertFeature(session.orgId, 'broadcasts')
  } catch (err) {
    if (err instanceof FeatureNotAvailableError) return { ok: false, error: t('notOnPlan') }
    throw err
  }

  return { ok: true, orgId: session.orgId, profileId: session.profileId }
}

function parseForm(formData: FormData) {
  let parentIds: unknown = []
  try {
    parentIds = JSON.parse(String(formData.get('parentIds') ?? '[]'))
  } catch {
    parentIds = null
  }
  return ListSchema.safeParse({ name: formData.get('name'), parentIds })
}

/** Of the submitted ids, only those that are parents in this org. */
async function ownParentIds(orgId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('parents')
    .select('id')
    .eq('organization_id', orgId)
    .in('id', [...new Set(ids)])
  if (error) throw new Error(`lists: parent check failed: ${error.message}`)
  return (data ?? []).map((r) => (r as { id: string }).id)
}

async function writeMembers(orgId: string, listId: string, parentIds: string[]) {
  const db = createServiceRoleClient()
  const { error: delError } = await db
    .from('broadcast_list_members')
    .delete()
    .eq('list_id', listId)
    .eq('organization_id', orgId)
  if (delError) throw new Error(`lists: clear members failed: ${delError.message}`)

  if (parentIds.length === 0) return
  const { error } = await db.from('broadcast_list_members').insert(
    parentIds.map((parentId) => ({ list_id: listId, parent_id: parentId, organization_id: orgId }))
  )
  if (error) throw new Error(`lists: insert members failed: ${error.message}`)
}

export async function createListAction(
  _prev: ListActionResult,
  formData: FormData
): Promise<ListActionResult> {
  const g = await guard()
  if (!g.ok) return { error: g.error }
  const t = await getTranslations('inbox.lists.errors')

  const parsed = parseForm(formData)
  if (!parsed.success) return { error: t('invalid') }

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('broadcast_lists')
    .insert({ organization_id: g.orgId, name: parsed.data.name, created_by: g.profileId })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[lists] create failed', { orgId: g.orgId, error: error?.message })
    return { error: t('saveFailed') }
  }

  const listId = (data as { id: string }).id
  try {
    await writeMembers(g.orgId, listId, await ownParentIds(g.orgId, parsed.data.parentIds))
  } catch (err) {
    console.error('[lists] members failed', { orgId: g.orgId, listId, err })
    return { error: t('saveFailed'), listId }
  }

  revalidatePath('/messages/lists')
  return { error: null, listId }
}

export async function updateListAction(
  listId: string,
  _prev: ListActionResult,
  formData: FormData
): Promise<ListActionResult> {
  const g = await guard()
  if (!g.ok) return { error: g.error }
  const t = await getTranslations('inbox.lists.errors')

  if (!ListIdSchema.safeParse(listId).success) return { error: t('invalid') }
  const parsed = parseForm(formData)
  if (!parsed.success) return { error: t('invalid') }

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('broadcast_lists')
    .update({ name: parsed.data.name })
    .eq('id', listId)
    .eq('organization_id', g.orgId)
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[lists] rename failed', { orgId: g.orgId, listId, error: error.message })
    return { error: t('saveFailed') }
  }
  // No row back means the id was not this org's — say "not found", never
  // touch its members.
  if (!data) return { error: t('notFound') }

  try {
    await writeMembers(g.orgId, listId, await ownParentIds(g.orgId, parsed.data.parentIds))
  } catch (err) {
    console.error('[lists] members failed', { orgId: g.orgId, listId, err })
    return { error: t('saveFailed') }
  }

  revalidatePath('/messages/lists')
  return { error: null, listId }
}

export async function deleteListAction(listId: string): Promise<ListActionResult> {
  const g = await guard()
  if (!g.ok) return { error: g.error }
  const t = await getTranslations('inbox.lists.errors')

  if (!ListIdSchema.safeParse(listId).success) return { error: t('invalid') }

  // Members go with it (on delete cascade). Campaigns already sent to this list
  // keep their recipient rows, so the delivery report still reads.
  const db = createServiceRoleClient()
  const { error } = await db
    .from('broadcast_lists')
    .delete()
    .eq('id', listId)
    .eq('organization_id', g.orgId)
  if (error) {
    console.error('[lists] delete failed', { orgId: g.orgId, listId, error: error.message })
    return { error: t('deleteFailed') }
  }

  revalidatePath('/messages/lists')
  return { error: null }
}
