import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type ChargeAuditEventType =
  | 'created'
  | 'amount_adjusted'
  | 'waived'
  | 'voided'
  | 'unwaived'
  | 'payment_recorded'
  | 'marked_paid'
  | 'webhook_paid'
  | 'reminder_sent'
  | 'payment_request_sent'
  | 'sync_conflict'

export interface ChargeAuditEntry {
  organizationId: string
  chargeId: string
  parentId?: string | null
  eventType: ChargeAuditEventType
  /** NULL for system actors: webhook, cron, billing engine. */
  actorProfileId?: string | null
  beforeStatus?: string | null
  afterStatus?: string | null
  beforeAmount?: number | null
  afterAmount?: number | null
  reason?: string | null
  metadata?: Record<string, unknown>
}

export interface ChargeAuditRow {
  id: string
  charge_id: string
  parent_id: string | null
  event_type: ChargeAuditEventType
  actor_profile_id: string | null
  actor_name: string | null
  before_status: string | null
  after_status: string | null
  before_amount: number | null
  after_amount: number | null
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

/**
 * Appends one row to the charge audit log.
 *
 * Best-effort by design: the ledger row itself is the source of truth, so a
 * failed audit insert is logged and swallowed rather than rolling back — or
 * failing — the business mutation that produced it.
 */
export async function logChargeAudit(entry: ChargeAuditEntry): Promise<void> {
  try {
    const db = createServiceRoleClient()
    const { error } = await db.from('charge_audit_log').insert({
      organization_id: entry.organizationId,
      charge_id: entry.chargeId,
      parent_id: entry.parentId ?? null,
      event_type: entry.eventType,
      actor_profile_id: entry.actorProfileId ?? null,
      before_status: entry.beforeStatus ?? null,
      after_status: entry.afterStatus ?? null,
      before_amount: entry.beforeAmount ?? null,
      after_amount: entry.afterAmount ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
    })

    if (error) {
      console.error('[chargeAudit] insert failed', {
        chargeId: entry.chargeId,
        eventType: entry.eventType,
        error: error.message,
      })
    }
  } catch (err) {
    console.error('[chargeAudit] insert threw', {
      chargeId: entry.chargeId,
      eventType: entry.eventType,
      err,
    })
  }
}

export async function getChargeAuditLog(
  organizationId: string,
  chargeId: string
): Promise<ChargeAuditRow[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('charge_audit_log')
    .select(
      'id, charge_id, parent_id, event_type, actor_profile_id, before_status, after_status, before_amount, after_amount, reason, metadata, created_at, profiles(full_name)'
    )
    .eq('organization_id', organizationId)
    .eq('charge_id', chargeId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return mapAuditRows(data ?? [])
}

export async function getParentAuditTimeline(
  organizationId: string,
  parentId: string,
  limit = 50
): Promise<ChargeAuditRow[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('charge_audit_log')
    .select(
      'id, charge_id, parent_id, event_type, actor_profile_id, before_status, after_status, before_amount, after_amount, reason, metadata, created_at, profiles(full_name)'
    )
    .eq('organization_id', organizationId)
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  return mapAuditRows(data ?? [])
}

function mapAuditRows(rows: unknown[]): ChargeAuditRow[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown> & {
      profiles?: { full_name: string | null } | null
    }
    return {
      id: r.id as string,
      charge_id: r.charge_id as string,
      parent_id: (r.parent_id as string | null) ?? null,
      event_type: r.event_type as ChargeAuditEventType,
      actor_profile_id: (r.actor_profile_id as string | null) ?? null,
      actor_name: r.profiles?.full_name ?? null,
      before_status: (r.before_status as string | null) ?? null,
      after_status: (r.after_status as string | null) ?? null,
      before_amount: r.before_amount == null ? null : Number(r.before_amount),
      after_amount: r.after_amount == null ? null : Number(r.after_amount),
      reason: (r.reason as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      created_at: r.created_at as string,
    }
  })
}
