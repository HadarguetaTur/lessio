/**
 * Audit trail for superadmin actions.
 * Server-only; service-role client.
 *
 * Per /docs/sprint-34-scope.md § /admin/audit.
 *
 * Before this, entering support mode for a tenant, editing their org, changing
 * their subscription and exporting their data were all `console.info` and
 * nothing else — invisible the moment the log rotated.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type AdminAuditAction =
  | 'support_mode.start'
  | 'support_mode.exit'
  | 'org.create'
  | 'org.update'
  | 'org.export'
  | 'org.deletion_request'
  | 'subscription.change_plan'
  | 'subscription.extend_trial'
  | 'subscription.set_status'
  | 'subscription.cancel'
  | 'plan.update'
  | 'staff.invite'
  | 'staff.role_change'
  | 'staff.deactivate'
  | 'staff.reactivate'
  | 'tracking.destination_save'
  | 'tracking.destination_delete'

export type AdminAuditEntry = {
  id: string
  actorProfileId: string | null
  actorName: string | null
  action: AdminAuditAction | string
  targetType: string | null
  targetId: string | null
  organizationId: string | null
  organizationName: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

/**
 * Records one action. Never throws: an audit write that fails must not take
 * down the action it was describing — that would make the log a new way for
 * admin operations to break. Failures go to the server log instead.
 */
export async function recordAdminAction(entry: {
  actorProfileId: string | null
  action: AdminAuditAction
  targetType?: string
  targetId?: string
  organizationId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const db = createServiceRoleClient()
    const { error } = await db.from('admin_audit_log').insert({
      actor_profile_id: entry.actorProfileId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      organization_id: entry.organizationId ?? null,
      metadata: entry.metadata ?? {},
    })
    if (error) {
      console.error('[admin-audit] insert failed', entry.action, error.message)
    }
  } catch (err) {
    console.error('[admin-audit] insert threw', entry.action, err)
  }
}

type RawAuditRow = {
  id: number
  actor_profile_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  organization_id: string | null
  metadata: unknown
  created_at: string
  profiles: { full_name: string } | null
  organizations: { name: string } | null
}

export async function listAdminAuditLog(options?: {
  organizationId?: string
  action?: string
  limit?: number
}): Promise<AdminAuditEntry[]> {
  const db = createServiceRoleClient()

  let query = db
    .from('admin_audit_log')
    .select(
      `id, actor_profile_id, action, target_type, target_id, organization_id,
       metadata, created_at,
       profiles ( full_name ),
       organizations ( name )`
    )
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 100)

  if (options?.organizationId) query = query.eq('organization_id', options.organizationId)
  if (options?.action) query = query.eq('action', options.action)

  const { data, error } = await query
  if (error || !data) return []

  return (data as unknown as RawAuditRow[]).map((r) => ({
    id: String(r.id),
    actorProfileId: r.actor_profile_id,
    actorName: r.profiles?.full_name ?? null,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    organizationId: r.organization_id,
    organizationName: r.organizations?.name ?? null,
    metadata:
      r.metadata && typeof r.metadata === 'object'
        ? (r.metadata as Record<string, unknown>)
        : {},
    createdAt: r.created_at,
  }))
}
