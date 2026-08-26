/**
 * Operator-side reads over the support queue — Sprint 32 M1.
 *
 * Callers have already passed requireSuperAdminSession(); these functions are
 * unscoped by org on purpose. Org names are resolved here rather than in the
 * page so the queue renders "רז מזוריק" instead of a uuid.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OPEN_TICKET_STATUSES, type SupportTicket, type TicketStatus } from '@/lib/support/tickets'

export interface AdminTicketListItem extends SupportTicket {
  organization_name: string
  reporter_name: string | null
}

export type QueueFilter = 'open' | 'all' | TicketStatus

/**
 * The operator queue. `filter` defaults to the unfinished work: everything that
 * is not resolved or closed, oldest first — the queue is a to-do list, and the
 * ticket that has waited longest is the one that should be answered next.
 */
export async function listTicketsForAdmin(
  filter: QueueFilter = 'open',
  limit = 100
): Promise<AdminTicketListItem[]> {
  const db = createServiceRoleClient()

  let query = db.from('support_tickets').select('*').limit(limit)

  if (filter === 'open') {
    query = query.in('status', [...OPEN_TICKET_STATUSES]).order('created_at', { ascending: true })
  } else if (filter === 'all') {
    query = query.order('created_at', { ascending: false })
  } else {
    query = query.eq('status', filter).order('created_at', { ascending: false })
  }

  const { data: tickets, error } = await query

  if (error || !tickets?.length) {
    if (error) {
      console.error('[superadmin/supportTickets] Failed to list tickets', { error: error.message })
    }
    return []
  }

  return decorate(tickets as SupportTicket[])
}

/** Attaches org and reporter names to a page of tickets in two lookups. */
async function decorate(tickets: SupportTicket[]): Promise<AdminTicketListItem[]> {
  const db = createServiceRoleClient()

  const orgIds = [...new Set(tickets.map((t) => t.organization_id))]
  const profileIds = [...new Set(tickets.map((t) => t.created_by).filter((id): id is string => !!id))]

  const [{ data: orgs }, profilesResult] = await Promise.all([
    db.from('organizations').select('id, name').in('id', orgIds),
    profileIds.length
      ? db.from('profiles').select('id, full_name').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ])

  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]))
  const profileName = new Map((profilesResult.data ?? []).map((p) => [p.id, p.full_name]))

  return tickets.map((t) => ({
    ...t,
    organization_name: orgName.get(t.organization_id) ?? t.organization_id,
    reporter_name: t.created_by ? (profileName.get(t.created_by) ?? null) : null,
  }))
}

export interface AdminTicketContext {
  organization_name: string
  reporter_name: string | null
  /** E.164. Email lives in auth.users, not profiles — and we WhatsApp anyway. */
  reporter_phone: string | null
}

/** Who filed this and from which org — the header of the ticket detail page. */
export async function getTicketContext(ticket: SupportTicket): Promise<AdminTicketContext> {
  const db = createServiceRoleClient()

  const [{ data: org }, { data: profile }] = await Promise.all([
    db.from('organizations').select('name').eq('id', ticket.organization_id).maybeSingle(),
    ticket.created_by
      ? db.from('profiles').select('full_name, phone').eq('id', ticket.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    organization_name: org?.name ?? ticket.organization_id,
    reporter_name: profile?.full_name ?? null,
    reporter_phone: profile?.phone ?? null,
  }
}

/** Count of tickets still needing an answer — for the admin dashboard/sidebar. */
export async function countOpenTickets(): Promise<number> {
  const db = createServiceRoleClient()

  const { count, error } = await db
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .in('status', [...OPEN_TICKET_STATUSES])

  if (error) {
    console.error('[superadmin/supportTickets] Failed to count open tickets', { error: error.message })
    return 0
  }

  return count ?? 0
}
