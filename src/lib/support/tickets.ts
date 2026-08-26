/**
 * Support ticket data layer — Sprint 32 M1.
 *
 * Tickets are customer→platform, not org→parent: the "customer" here is the org
 * owner or admin, and the responder is the platform operator in /admin/support.
 *
 * All access is via service role (RLS deny-all on both tables). Callers are
 * responsible for authorisation: dashboard actions scope by the session's
 * orgId, admin actions have already passed requireSuperAdminSession().
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_on_customer'
  | 'resolved'
  | 'closed'

export type TicketCategory = 'bug' | 'question' | 'feature_request' | 'other'
export type TicketSeverity = 'low' | 'medium' | 'high' | 'critical'
export type TicketSource = 'widget' | 'whatsapp' | 'auto'
export type MessageAuthorType = 'customer' | 'admin' | 'ai' | 'system'

/** Statuses that still need someone to act. Mirrors idx_support_tickets_status. */
export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = [
  'open',
  'in_progress',
  'waiting_on_customer',
]

export interface SupportTicket {
  id: string
  organization_id: string
  created_by: string | null
  subject: string
  status: TicketStatus
  category: TicketCategory | null
  severity: TicketSeverity | null
  source: TicketSource
  page_url: string | null
  user_agent: string | null
  ai_classified_at: string | null
  resolved_at: string | null
  /** The dev issue this ticket reports, once identified. Sprint 32 M3. */
  dev_issue_id: string | null
  created_at: string
  updated_at: string
}

export interface SupportTicketMessage {
  id: string
  ticket_id: string
  author_type: MessageAuthorType
  author_profile_id: string | null
  body: string
  created_at: string
}

export interface CreateTicketParams {
  orgId: string
  createdBy: string | null
  subject: string
  body: string
  source: TicketSource
  category?: TicketCategory | null
  pageUrl?: string | null
  userAgent?: string | null
}

/**
 * Creates a ticket and its opening message.
 *
 * The two inserts are not in a transaction — supabase-js has no client-side
 * transaction. A ticket with no messages is recoverable (the subject still says
 * what it is) and rare enough not to justify an RPC; the reverse ordering, an
 * orphan message, is not possible.
 *
 * @returns the new ticket id, or null when the ticket insert failed.
 */
export async function createTicket(params: CreateTicketParams): Promise<string | null> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('support_tickets')
    .insert({
      organization_id: params.orgId,
      created_by: params.createdBy,
      subject: params.subject,
      source: params.source,
      category: params.category ?? null,
      page_url: params.pageUrl ?? null,
      user_agent: params.userAgent ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[support/tickets] Failed to create ticket', {
      orgId: params.orgId,
      source: params.source,
      error: error?.message,
    })
    return null
  }

  await addMessage({
    ticketId: data.id,
    authorType: 'customer',
    authorProfileId: params.createdBy,
    body: params.body,
  })

  return data.id
}

export interface AddMessageParams {
  ticketId: string
  authorType: MessageAuthorType
  authorProfileId?: string | null
  body: string
}

/** Appends a message to a thread. Returns false when the insert failed. */
export async function addMessage(params: AddMessageParams): Promise<boolean> {
  const db = createServiceRoleClient()

  const { error } = await db.from('support_ticket_messages').insert({
    ticket_id: params.ticketId,
    author_type: params.authorType,
    author_profile_id: params.authorProfileId ?? null,
    body: params.body,
  })

  if (error) {
    console.error('[support/tickets] Failed to add message', {
      ticketId: params.ticketId,
      authorType: params.authorType,
      error: error.message,
    })
    return false
  }

  return true
}

/** A ticket plus the number of messages on it — the shape both list views need. */
export interface TicketListItem extends SupportTicket {
  message_count: number
  last_message_at: string
}

/** Newest first. `orgId` scoping is the customer-side authorisation boundary. */
export async function listTicketsForOrg(orgId: string, limit = 50): Promise<TicketListItem[]> {
  const db = createServiceRoleClient()

  const { data: tickets, error } = await db
    .from('support_tickets')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !tickets?.length) {
    if (error) {
      console.error('[support/tickets] Failed to list tickets', { orgId, error: error.message })
    }
    return []
  }

  return withMessageCounts(tickets as SupportTicket[])
}

/**
 * Attaches message counts + last activity to a page of tickets in one query.
 *
 * Deliberately not a DB view or an aggregate select: supabase-js cannot express
 * `count(*) group by` without an RPC, and a page is at most `limit` tickets, so
 * one extra indexed query over their message rows is cheaper than the migration.
 */
async function withMessageCounts(tickets: SupportTicket[]): Promise<TicketListItem[]> {
  const db = createServiceRoleClient()
  const ids = tickets.map((t) => t.id)

  const { data: messages } = await db
    .from('support_ticket_messages')
    .select('ticket_id, created_at')
    .in('ticket_id', ids)

  const counts = new Map<string, { count: number; last: string }>()
  for (const m of messages ?? []) {
    const prev = counts.get(m.ticket_id)
    if (!prev) {
      counts.set(m.ticket_id, { count: 1, last: m.created_at })
    } else {
      prev.count += 1
      if (m.created_at > prev.last) prev.last = m.created_at
    }
  }

  return tickets.map((t) => ({
    ...t,
    message_count: counts.get(t.id)?.count ?? 0,
    last_message_at: counts.get(t.id)?.last ?? t.created_at,
  }))
}

export interface TicketWithMessages {
  ticket: SupportTicket
  messages: SupportTicketMessage[]
}

/**
 * Loads a thread.
 *
 * `orgId` is optional so the same function serves both shells: the customer
 * pages pass it (a ticket from another org must read as not-found, never as
 * forbidden), the admin pages omit it.
 */
export async function getTicketWithMessages(
  ticketId: string,
  orgId?: string
): Promise<TicketWithMessages | null> {
  const db = createServiceRoleClient()

  let query = db.from('support_tickets').select('*').eq('id', ticketId)
  if (orgId) query = query.eq('organization_id', orgId)

  const { data: ticket, error } = await query.maybeSingle()

  if (error || !ticket) {
    if (error) {
      console.error('[support/tickets] Failed to load ticket', { ticketId, error: error.message })
    }
    return null
  }

  const { data: messages } = await db
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })

  return {
    ticket: ticket as SupportTicket,
    messages: (messages ?? []) as SupportTicketMessage[],
  }
}

/**
 * Moves a ticket to a new status, stamping resolved_at on the way into
 * 'resolved' and clearing it on the way back out — so "resolved twice" reports
 * the second resolution, and a reopened ticket has no resolution date at all.
 */
export async function setStatus(ticketId: string, status: TicketStatus): Promise<boolean> {
  const db = createServiceRoleClient()

  const { error } = await db
    .from('support_tickets')
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', ticketId)

  if (error) {
    console.error('[support/tickets] Failed to set status', { ticketId, status, error: error.message })
    return false
  }

  return true
}

/**
 * How many tickets this org opened in the last `withinHours`.
 *
 * Backs the create-ticket rate limit. Counting per org rather than per profile
 * is intentional: the limit protects the operator's queue, and three admins in
 * one org filing thirty tickets is the same flood as one admin filing thirty.
 */
export async function countRecentTicketsForOrg(orgId: string, withinHours = 24): Promise<number> {
  const db = createServiceRoleClient()
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString()

  const { count, error } = await db
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gt('created_at', since)

  if (error) {
    // Fail open: a counting failure must not block a customer from reaching us.
    console.error('[support/tickets] Failed to count recent tickets', { orgId, error: error.message })
    return 0
  }

  return count ?? 0
}
