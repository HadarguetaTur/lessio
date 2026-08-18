/**
 * Superadmin data deletion helpers.
 * Per /docs/sprint-23-scope.md § Story 1a.
 *
 * Anonymisation strategy (GDPR Art. 17 / masking):
 *   parent.name  → '[מחוק]'
 *   parent.phone → '***'
 *   student.name → '[מחוק]'
 * Row deletion is NOT performed — billing/audit history must be preserved.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Placeholder written over a deleted person's name. A stable marker rather than
 * display copy — it is stored and read back by whoever views the record, in
 * whatever language they use.
 */
const DELETED_NAME = '[deleted]'

export type DeletionRequest = {
  id: string
  organizationId: string
  requesterPhone: string
  status: 'open' | 'processed' | 'dismissed'
  processedAt: string | null
  createdAt: string
}

export async function listDeletionRequests(orgId: string): Promise<DeletionRequest[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('data_deletion_requests')
    .select('id, organization_id, requester_phone, status, processed_at, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    requesterPhone: r.requester_phone,
    status: r.status as DeletionRequest['status'],
    processedAt: r.processed_at,
    createdAt: r.created_at,
  }))
}

/**
 * Processes a deletion request.
 *
 * action = 'anonymise': masks parent + student names/phone for the requester's number.
 * action = 'dismiss': marks the request closed without data changes.
 */
export async function processDeletionRequest(
  requestId: string,
  action: 'anonymise' | 'dismiss',
  processedByProfileId: string
): Promise<void> {
  const db = createServiceRoleClient()

  const { data: req, error: fetchErr } = await db
    .from('data_deletion_requests')
    .select('id, organization_id, requester_phone, status')
    .eq('id', requestId)
    .single()

  if (fetchErr || !req) throw new Error(`Deletion request not found: ${requestId}`)
  if (req.status !== 'open') throw new Error(`Request ${requestId} is already ${req.status}`)

  if (action === 'anonymise') {
    const phone = req.requester_phone as string
    const orgId = req.organization_id as string

    // Mask the parent row
    const { data: parent } = await db
      .from('parents')
      .select('id')
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .maybeSingle()

    if (parent) {
      await db
        .from('parents')
        .update({ full_name: DELETED_NAME, phone: '***' })
        .eq('id', parent.id)

      // Mask all linked students
      const { data: relationships } = await db
        .from('relationships')
        .select('student_id')
        .eq('parent_id', parent.id)
        .eq('organization_id', orgId)

      const studentIds = (relationships ?? []).map((r) => r.student_id as string)

      for (const studentId of studentIds) {
        await db
          .from('students')
          .update({ full_name: DELETED_NAME })
          .eq('id', studentId)
          .eq('organization_id', orgId)
      }
    }
  }

  const { error: updateErr } = await db
    .from('data_deletion_requests')
    .update({
      status: action === 'anonymise' ? 'processed' : 'dismissed',
      processed_at: new Date().toISOString(),
      processed_by: processedByProfileId,
    })
    .eq('id', requestId)

  if (updateErr) throw new Error(updateErr.message)
}

/**
 * Inserts a deletion request from a portal parent.
 * Called via a portal Server Action (service role, no Supabase session).
 */
export async function createDeletionRequest(params: {
  orgId: string
  requesterPhone: string
}): Promise<void> {
  const db = createServiceRoleClient()

  // Deduplicate: don't insert if an open request already exists for this phone in this org
  const { data: existing } = await db
    .from('data_deletion_requests')
    .select('id')
    .eq('organization_id', params.orgId)
    .eq('requester_phone', params.requesterPhone)
    .eq('status', 'open')
    .maybeSingle()

  if (existing) return // idempotent

  const { error } = await db.from('data_deletion_requests').insert({
    organization_id: params.orgId,
    requester_phone: params.requesterPhone,
  })

  if (error) throw new Error(error.message)
}
