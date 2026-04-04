'use server'

import { redirect } from 'next/navigation'
import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { setSupportSessionCookie, clearSupportSessionCookie } from '@/lib/support-session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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
