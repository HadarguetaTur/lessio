/**
 * The four numbers on /admin/outbound. Head counts only — no rows cross the
 * wire — same approach as src/lib/superadmin/navCounts.ts.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface OutboundStats {
  queued: number
  sent7d: number
  replies7d: number
  interested7d: number
}

export async function getOutboundStats(now: Date = new Date()): Promise<OutboundStats> {
  const db = createServiceRoleClient()
  const since = DateTime.fromJSDate(now).minus({ days: 7 }).toISO()!

  const [queued, sent, replies, interested] = await Promise.all([
    db.from('outbound_prospects').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    db.from('outbound_prospects').select('id', { count: 'exact', head: true }).gte('sent_at', since),
    db
      .from('outbound_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'in')
      .neq('classification', 'auto_reply')
      .gte('created_at', since),
    db
      .from('outbound_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'in')
      .eq('classification', 'interested')
      .gte('created_at', since),
  ])

  return {
    queued: queued.count ?? 0,
    sent7d: sent.count ?? 0,
    replies7d: replies.count ?? 0,
    interested7d: interested.count ?? 0,
  }
}
