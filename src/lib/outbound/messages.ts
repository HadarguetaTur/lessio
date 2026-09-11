/**
 * Inbound messages as the admin screens read and clear them.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { InboundMessageRow } from './types'

export async function listInboundReplies(limit = 100): Promise<InboundMessageRow[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('outbound_messages')
    .select('id, prospect_id, from_email, subject, body, classification, reviewed_at, created_at')
    .eq('direction', 'in')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[outbound/messages] list failed: ${error.message}`)
  return (data ?? []) as InboundMessageRow[]
}

/** A person has read it. Idempotent; only unreviewed inbound rows change. */
export async function markInboundReviewed(
  key: { messageId: string } | { prospectId: string }
): Promise<number> {
  const db = createServiceRoleClient()
  let q = db
    .from('outbound_messages')
    .update({ reviewed_at: new Date().toISOString() })
    .eq('direction', 'in')
    .is('reviewed_at', null)
  q = 'messageId' in key ? q.eq('id', key.messageId) : q.eq('prospect_id', key.prospectId)
  const { data, error } = await q.select('id')
  if (error) throw new Error(`[outbound/messages] review failed: ${error.message}`)
  return (data ?? []).length
}
