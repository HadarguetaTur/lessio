/**
 * Superadmin hard-delete of a tenant.
 *
 * Reached only from the danger zone of /admin/orgs/[id]. Removes, in order:
 *   1. every file the tenant stored (all buckets keep tenant files under
 *      "<orgId>/..."), so the storage service never keeps orphaned blobs;
 *   2. every database row carrying the tenant's organization_id plus the
 *      organization row itself, in one transaction
 *      (delete_organization_completely — supabase/migrations/20260907100000);
 *   3. the Supabase Auth users behind the tenant's profiles, which nothing
 *      cascades to because the FK runs the other way (auth.users → profiles).
 *
 * Storage goes first because it is the step that cannot be rolled back
 * together with the rows: if it fails the tenant is still whole. Auth goes last
 * because an auth user that survives an otherwise-deleted tenant is harmless
 * (no profile, no org — `getSession` refuses it) and is reported back so the
 * operator can retry.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type DeleteOrganizationResult = {
  orgId: string
  orgName: string
  /** Row counts per table, as reported by the database function. */
  deletedRows: Record<string, number>
  storageObjectsRemoved: number
  authUsersDeleted: number
  /** Auth user ids that could not be deleted; the rows are already gone. */
  authUsersFailed: string[]
}

export class OrganizationDeleteError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_found'
      | 'confirmation_mismatch'
      | 'storage_failed'
      | 'database_failed'
  ) {
    super(message)
    this.name = 'OrganizationDeleteError'
  }
}

/**
 * @param confirmation what the operator typed; must equal the org's slug.
 *   Checked here, not only in the UI, so a stray call cannot skip it.
 */
export async function deleteOrganizationCompletely(params: {
  orgId: string
  confirmation: string
}): Promise<DeleteOrganizationResult> {
  const db = createServiceRoleClient()

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id, name, slug')
    .eq('id', params.orgId)
    .maybeSingle()

  if (orgErr) throw new OrganizationDeleteError(orgErr.message, 'database_failed')
  if (!org) throw new OrganizationDeleteError('Organization not found', 'not_found')
  if (params.confirmation.trim() !== org.slug) {
    throw new OrganizationDeleteError('Confirmation does not match the slug', 'confirmation_mismatch')
  }

  // Auth user ids must be read before the rows disappear.
  const { data: profiles, error: profilesErr } = await db
    .from('profiles')
    .select('id')
    .eq('organization_id', org.id)
  if (profilesErr) throw new OrganizationDeleteError(profilesErr.message, 'database_failed')
  const authUserIds = (profiles ?? []).map((p) => p.id as string)

  // 1. Storage
  const storageObjectsRemoved = await removeTenantStorage(db, org.id)

  // 2. Rows, in one transaction
  const { data: summary, error: rpcErr } = await db.rpc('delete_organization_completely', {
    p_org_id: org.id,
  })
  if (rpcErr) {
    throw new OrganizationDeleteError(rpcErr.message, 'database_failed')
  }

  // 3. Auth users
  const authUsersFailed: string[] = []
  for (const userId of authUserIds) {
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) {
      console.error('[admin/deleteOrganization] auth user delete failed', { userId, error: error.message })
      authUsersFailed.push(userId)
    }
  }

  const deleted = (summary as { deleted?: Record<string, number> } | null)?.deleted ?? {}

  return {
    orgId: org.id,
    orgName: org.name,
    deletedRows: deleted,
    storageObjectsRemoved,
    authUsersDeleted: authUserIds.length - authUsersFailed.length,
    authUsersFailed,
  }
}

async function removeTenantStorage(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string
): Promise<number> {
  const { data, error } = await db.rpc('list_organization_storage_objects', { p_org_id: orgId })
  if (error) throw new OrganizationDeleteError(error.message, 'storage_failed')

  const byBucket = new Map<string, string[]>()
  for (const row of (data ?? []) as { bucket_id: string; name: string }[]) {
    const list = byBucket.get(row.bucket_id) ?? []
    list.push(row.name)
    byBucket.set(row.bucket_id, list)
  }

  let removed = 0
  for (const [bucket, names] of byBucket) {
    // The storage API caps a single remove call; chunk to stay under it.
    for (let i = 0; i < names.length; i += 100) {
      const chunk = names.slice(i, i + 100)
      const { error: removeErr } = await db.storage.from(bucket).remove(chunk)
      if (removeErr) {
        throw new OrganizationDeleteError(
          `Storage bucket "${bucket}": ${removeErr.message}`,
          'storage_failed'
        )
      }
      removed += chunk.length
    }
  }
  return removed
}

export type OrganizationFootprint = {
  teachers: number
  students: number
  parents: number
  lessons: number
  users: number
}

/** Row counts shown next to the delete button so the operator sees what goes. */
export async function getOrganizationFootprint(orgId: string): Promise<OrganizationFootprint> {
  const db = createServiceRoleClient()
  const count = async (table: string) => {
    const { count: n } = await db
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
    return n ?? 0
  }
  const [teachers, students, parents, lessons, users] = await Promise.all([
    count('teachers'),
    count('students'),
    count('parents'),
    count('lessons'),
    count('profiles'),
  ])
  return { teachers, students, parents, lessons, users }
}
