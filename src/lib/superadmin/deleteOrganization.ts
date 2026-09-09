/**
 * Superadmin hard-delete of a tenant.
 *
 * Reached only from the danger zone of /admin/orgs/[id]. Removes, in order:
 *   0. a JSON snapshot of the tenant's operational data, taken before anything
 *      is touched and handed back to the operator (see ./exportOrgData.ts for
 *      what it does and does not contain);
 *   1. every database row carrying the tenant's organization_id plus the
 *      organization row itself, in one transaction
 *      (delete_organization_completely — supabase/migrations/20260907100000);
 *   2. every file the tenant stored (all buckets keep tenant files under
 *      "<orgId>/..."), so the storage service never keeps orphaned blobs;
 *   3. the Supabase Auth users behind the tenant's profiles, which nothing
 *      cascades to because the FK runs the other way (auth.users → profiles).
 *
 * ── Why the database goes first (SUPPORT-03) ─────────────────────────────────
 * Storage used to go first, on the reasoning that it is the step that cannot be
 * rolled back with the rows. That reasoning had the failure the wrong way
 * round. The RPC has its own "no progress" guard, which trips whenever a table
 * carries organization_id without a usable FK ordering — a schema change is
 * enough. When it tripped, the files were already irrecoverably gone and the
 * org was still whole: a live tenant whose every homework attachment, exam
 * file and progress report had vanished, with no per-tenant restore to go to.
 *
 * With the DB first, a failed RPC leaves the tenant completely intact, files
 * included, and the operator can retry. The residue of the opposite failure —
 * storage erroring after the rows are gone — is orphaned blobs nobody can read
 * (their rows no longer exist), which is a cleanup task, not a data loss. So
 * storage failures after the RPC are REPORTED, not thrown: throwing would tell
 * the operator the deletion failed when the tenant is in fact gone.
 *
 * The file listing does not depend on the org row — it matches storage.objects
 * by the "<orgId>/" path prefix — so it still works after the RPC.
 *
 * Auth goes last because an auth user that survives an otherwise-deleted tenant
 * is harmless (no profile, no org — `getSession` refuses it) and is reported
 * back so the operator can retry.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildOrgDataExport, type OrgDataExport } from './exportOrgData'

export type DeleteOrganizationResult = {
  orgId: string
  orgName: string
  /** Row counts per table, as reported by the database function. */
  deletedRows: Record<string, number>
  storageObjectsRemoved: number
  /** Files the storage service refused to remove. The rows are already gone. */
  storageObjectsFailed: number
  authUsersDeleted: number
  /** Auth user ids that could not be deleted; the rows are already gone. */
  authUsersFailed: string[]
  /** Pre-delete snapshot, for the operator to keep. Null if it could not be taken. */
  snapshot: OrgDataExport | null
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

  // 0. Snapshot, before anything is destroyed. Best-effort: a delete the
  //    operator asked for twice should not be blocked by an export failing,
  //    but they are told they have no snapshot.
  let snapshot: OrgDataExport | null = null
  try {
    snapshot = await buildOrgDataExport(org.id)
  } catch (err) {
    console.error('[admin/deleteOrganization] pre-delete snapshot failed', {
      orgId: org.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 1. Rows, in one transaction. Nothing irreversible has happened yet, so a
  //    failure here leaves the tenant whole — files included.
  const { data: summary, error: rpcErr } = await db.rpc('delete_organization_completely', {
    p_org_id: org.id,
  })
  if (rpcErr) {
    throw new OrganizationDeleteError(rpcErr.message, 'database_failed')
  }

  // 2. Storage. Past this point the tenant is gone; a storage error is
  //    orphaned blobs to clean up, not a failed deletion.
  const storage = await removeTenantStorage(db, org.id)

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
    storageObjectsRemoved: storage.removed,
    storageObjectsFailed: storage.failed,
    authUsersDeleted: authUserIds.length - authUsersFailed.length,
    authUsersFailed,
    snapshot,
  }
}

/**
 * Removes every file under "<orgId>/" in every bucket. Never throws: it runs
 * after the rows are gone, so a failure is reported as a count of files left
 * behind rather than as a failed deletion.
 */
async function removeTenantStorage(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string
): Promise<{ removed: number; failed: number }> {
  const { data, error } = await db.rpc('list_organization_storage_objects', { p_org_id: orgId })
  if (error) {
    console.error('[admin/deleteOrganization] storage listing failed — files left behind', {
      orgId,
      error: error.message,
    })
    return { removed: 0, failed: 0 }
  }

  const byBucket = new Map<string, string[]>()
  for (const row of (data ?? []) as { bucket_id: string; name: string }[]) {
    const list = byBucket.get(row.bucket_id) ?? []
    list.push(row.name)
    byBucket.set(row.bucket_id, list)
  }

  let removed = 0
  let failed = 0
  for (const [bucket, names] of byBucket) {
    // The storage API caps a single remove call; chunk to stay under it.
    for (let i = 0; i < names.length; i += 100) {
      const chunk = names.slice(i, i + 100)
      const { error: removeErr } = await db.storage.from(bucket).remove(chunk)
      if (removeErr) {
        console.error('[admin/deleteOrganization] storage remove failed — files left behind', {
          orgId,
          bucket,
          count: chunk.length,
          error: removeErr.message,
        })
        failed += chunk.length
        continue
      }
      removed += chunk.length
    }
  }
  return { removed, failed }
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

