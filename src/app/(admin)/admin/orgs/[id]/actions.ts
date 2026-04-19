'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { setSupportSessionCookie, clearSupportSessionCookie } from '@/lib/support-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { processDeletionRequest } from '@/lib/superadmin/dataDeletion'

export async function startSupportModeAction(orgId: string): Promise<never> {
  const session = await requireSuperAdminSession()

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
  })

  console.info('[support-mode] started', {
    superAdminId: session.userId,
    targetOrgId: orgId,
    orgName: org.name,
  })

  redirect('/dashboard')
}

export async function exitSupportModeAction(): Promise<never> {
  await clearSupportSessionCookie()

  console.info('[support-mode] exited')

  redirect('/admin/orgs')
}

// ── Story 1a (Sprint 23): Deletion request processing ────────────────────────

export async function processDeletionRequestAction(
  requestId: string,
  action: 'anonymise' | 'dismiss',
  orgId: string
): Promise<{ error: string | null }> {
  const session = await requireSuperAdminSession()

  try {
    await processDeletionRequest(requestId, action, session.profileId)
    revalidatePath(`/admin/orgs/${orgId}`)
    return { error: null }
  } catch (err) {
    console.error('[admin/deletion] processDeletionRequest failed', { requestId, action, err })
    return { error: err instanceof Error ? err.message : 'שגיאה בעיבוד הבקשה' }
  }
}

// ── Story 1b (Sprint 23): Data export ────────────────────────────────────────

export async function exportOrgDataAction(orgId: string): Promise<{ json: string }> {
  await requireSuperAdminSession()

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

  console.info('[admin/export] Org data exported', { orgId, superAdmin: true })

  return { json: JSON.stringify(payload, null, 2) }
}
