'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requirePlatformSession } from '@/lib/superadmin/session'
import {
  setSupportSessionCookie,
  clearSupportSessionCookie,
  getSupportSession,
} from '@/lib/support-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { processDeletionRequest } from '@/lib/superadmin/dataDeletion'
import {
  deleteOrganizationCompletely,
  OrganizationDeleteError,
} from '@/lib/superadmin/deleteOrganization'
import { recordAdminAction } from '@/lib/superadmin/audit'
import { getTranslations } from 'next-intl/server'

export async function startSupportModeAction(orgId: string): Promise<never> {
  const session = await requirePlatformSession('support_mode.enter')

  // Verify org exists
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()

  if (!org) redirect('/admin/orgs')

  await setSupportSessionCookie({
    superAdminId: session.userId,
    targetOrgId: orgId,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    grantedRole: session.role,
  })

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'support_mode.start',
    targetType: 'organizations',
    targetId: orgId,
    organizationId: orgId,
    metadata: { orgName: org.name },
  })

  redirect('/dashboard')
}

export async function exitSupportModeAction(): Promise<never> {
  // Read the session before clearing the cookie: this is the one admin action
  // reachable from the dashboard shell (SupportModeBanner imports it), and it
  // previously ran for any authenticated caller with no check at all.
  const support = await getSupportSession()
  await clearSupportSessionCookie()

  if (support) {
    await recordAdminAction({
      actorProfileId: support.superAdminId,
      action: 'support_mode.exit',
      targetType: 'organizations',
      targetId: support.targetOrgId,
      organizationId: support.targetOrgId,
    })
  }

  redirect('/admin/orgs')
}

// ── Story 1a (Sprint 23): Deletion request processing ────────────────────────

export async function processDeletionRequestAction(
  requestId: string,
  action: 'anonymise' | 'dismiss',
  orgId: string
): Promise<{ error: string | null }> {
  const t = await getTranslations()
  const session = await requirePlatformSession('orgs.write')

  try {
    await processDeletionRequest(requestId, action, session.profileId)
    await recordAdminAction({
      actorProfileId: session.profileId,
      action: 'org.deletion_request',
      targetType: 'data_deletion_requests',
      targetId: requestId,
      organizationId: orgId,
      metadata: { decision: action },
    })
    revalidatePath(`/admin/orgs/${orgId}`)
    return { error: null }
  } catch (err) {
    console.error('[admin/deletion] processDeletionRequest failed', { requestId, action, err })
    return { error: t('admin.errors.requestFailed') }
  }
}

// ── Story 1b (Sprint 23): Data export ────────────────────────────────────────

export async function exportOrgDataAction(orgId: string): Promise<{ json: string }> {
  const session = await requirePlatformSession('orgs.export')

  const db = createServiceRoleClient()

  const [parents, students, lessons, charges] = await Promise.all([
    db.from('parents').select('*').eq('organization_id', orgId),
    db.from('students').select('*').eq('organization_id', orgId),
    db.from('lessons').select('*').eq('organization_id', orgId),
    db.from('charges').select('*').eq('organization_id', orgId),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    org_id: orgId,
    parents: parents.data ?? [],
    students: students.data ?? [],
    lessons: lessons.data ?? [],
    charges: charges.data ?? [],
  }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'org.export',
    targetType: 'organizations',
    targetId: orgId,
    organizationId: orgId,
    metadata: {
      parents: payload.parents.length,
      students: payload.students.length,
      lessons: payload.lessons.length,
      charges: payload.charges.length,
    },
  })

  return { json: JSON.stringify(payload, null, 2) }
}

// ── Danger zone: hard-delete a tenant ────────────────────────────────────────

export type DeleteOrganizationActionResult =
  | { ok: true; orgName: string; deletedRows: number; authUsersFailed: string[] }
  | { ok: false; error: string }

/**
 * Hard-deletes an organization, its rows, its files and its auth users.
 * Superadmin only (orgs.delete); the operator must type the slug. Redirects
 * to the tenant list on success, since the page being viewed no longer exists.
 */
export async function deleteOrganizationAction(
  orgId: string,
  confirmation: string
): Promise<DeleteOrganizationActionResult> {
  const t = await getTranslations()
  const session = await requirePlatformSession('orgs.delete')

  // Refuse while impersonating: support mode targets this org and would be
  // left pointing at nothing.
  const support = await getSupportSession()
  if (support?.targetOrgId === orgId) {
    return { ok: false, error: t('admin.orgs.danger.errors.inSupportMode') }
  }

  let result
  try {
    result = await deleteOrganizationCompletely({ orgId, confirmation })
  } catch (err) {
    if (err instanceof OrganizationDeleteError) {
      console.error('[admin/deleteOrganization] failed', { orgId, code: err.code, message: err.message })
      if (err.code === 'confirmation_mismatch') {
        return { ok: false, error: t('admin.orgs.danger.errors.confirmationMismatch') }
      }
      if (err.code === 'not_found') {
        return { ok: false, error: t('admin.orgs.danger.errors.notFound') }
      }
    } else {
      console.error('[admin/deleteOrganization] threw', { orgId, err })
    }
    return { ok: false, error: t('admin.errors.requestFailed') }
  }

  // organization_id is left null on purpose: the org row is gone and the
  // audit FK is ON DELETE SET NULL anyway. Identity lives in metadata.
  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'org.delete',
    targetType: 'organizations',
    targetId: orgId,
    organizationId: null,
    metadata: {
      orgName: result.orgName,
      deletedRows: result.deletedRows,
      storageObjectsRemoved: result.storageObjectsRemoved,
      authUsersDeleted: result.authUsersDeleted,
      authUsersFailed: result.authUsersFailed,
    },
  })

  revalidatePath('/admin/orgs')

  return {
    ok: true,
    orgName: result.orgName,
    deletedRows: Object.values(result.deletedRows).reduce((a, b) => a + b, 0),
    authUsersFailed: result.authUsersFailed,
  }
}
