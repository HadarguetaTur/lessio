'use server'

/**
 * Customer-side support actions — Sprint 32 M1.
 *
 * These are the org's own view of a ticket it raised against the platform.
 * Support is deliberately NOT plan-gated (no requireFeature): an org that has
 * run out of quota or lapsed into read-only billing is precisely the org that
 * needs to reach us.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { notifySuperadmins } from '@/lib/notifications'
import {
  createTicket,
  addMessage,
  getTicketWithMessages,
  countRecentTicketsForOrg,
  listTicketsForOrg,
  setStatus,
  type TicketCategory,
  type SupportTicketMessage,
  type TicketStatus,
} from '@/lib/support/tickets'
import { subjectFrom } from '@/lib/support/subject'
import { classifyTicketInBackground } from '@/lib/support/classify'

/**
 * Tickets per org per day. High enough that nobody legitimately reporting a bad
 * morning hits it, low enough that a stuck retry loop cannot bury the queue.
 */
const DAILY_TICKET_LIMIT = 10

const CATEGORIES = ['bug', 'question', 'feature_request', 'other'] as const

const createSchema = z.object({
  // No subject field any more: the widget is a conversation, and asking someone
  // to title their problem before describing it is a form's habit. The operator
  // queue's one-line label is derived from the message instead.
  body: z.string().trim().min(10, 'support.errors.bodyRequired').max(5000),
  category: z.enum(CATEGORIES).optional(),
  pageUrl: z.string().trim().max(500).optional(),
})

export type CreateTicketState = { error: string | null; ticketId?: string }

/** Only the people who own the relationship with us may open a ticket. */
function canOpenTickets(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

export async function createTicketAction(
  _prev: CreateTicketState | null,
  formData: FormData
): Promise<CreateTicketState> {
  const session = await getSession()
  try {
    requireMutation(session, { allowWhenLapsed: true })
  } catch {
    return { error: await commonError('supportModeReadOnly') }
  }

  if (!canOpenTickets(session.role)) return { error: await commonError('noPermission') }

  const parsed = createSchema.safeParse({
    body: formData.get('body'),
    category: formData.get('category') || undefined,
    pageUrl: formData.get('page_url') || undefined,
  })

  if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

  const recent = await countRecentTicketsForOrg(session.orgId, 24)
  if (recent >= DAILY_TICKET_LIMIT) {
    const t = await getTranslations('support.errors')
    return { error: t('rateLimited', { limit: DAILY_TICKET_LIMIT }) }
  }

  const subject = subjectFrom(parsed.data.body)

  const ticketId = await createTicket({
    orgId: session.orgId,
    createdBy: session.profileId,
    subject,
    body: parsed.data.body,
    source: 'widget',
    category: (parsed.data.category ?? null) as TicketCategory | null,
    pageUrl: parsed.data.pageUrl ?? null,
    // Kept short: this is triage context, not fingerprinting.
    userAgent: formData.get('user_agent')?.toString().slice(0, 300) ?? null,
  })

  if (!ticketId) return { error: await commonError('saveFailed') }

  // Enrichment, not a gate: the customer gets their confirmation either way.
  classifyTicketInBackground(ticketId, subject, parsed.data.body)

  await notifyOperatorOfNewTicket(session.orgId, subject, ticketId)

  revalidatePath('/support')
  return { error: null, ticketId }
}

/**
 * Tells the platform operator a ticket landed.
 *
 * Fire-and-forget by contract (notifySuperadmins never throws): a notification
 * failure must not fail the customer's submission — the ticket is already saved
 * and visible in the queue either way.
 */
async function notifyOperatorOfNewTicket(
  orgId: string,
  subject: string,
  ticketId: string
): Promise<void> {
  const db = createServiceRoleClient()
  const { data: org } = await db.from('organizations').select('name').eq('id', orgId).single()

  await notifySuperadmins(
    'support_ticket_new',
    subject,
    org?.name ?? orgId,
    `/admin/support/${ticketId}`
  )
}

const replySchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1, 'support.errors.bodyRequired').max(5000),
})

export type ReplyState = { error: string | null }

export async function replyToTicketAction(
  _prev: ReplyState | null,
  formData: FormData
): Promise<ReplyState> {
  const session = await getSession()
  try {
    requireMutation(session, { allowWhenLapsed: true })
  } catch {
    return { error: await commonError('supportModeReadOnly') }
  }

  if (!canOpenTickets(session.role)) return { error: await commonError('noPermission') }

  const parsed = replySchema.safeParse({
    ticketId: formData.get('ticket_id'),
    body: formData.get('body'),
  })

  if (!parsed.success) return { error: await zodError(parsed.error.issues[0]) }

  // Scoped read: a ticket belonging to another org must read as not-found.
  const thread = await getTicketWithMessages(parsed.data.ticketId, session.orgId)
  if (!thread) return { error: await commonError('notFound') }

  if (thread.ticket.status === 'closed') {
    const t = await getTranslations('support.errors')
    return { error: t('ticketClosed') }
  }

  const ok = await addMessage({
    ticketId: parsed.data.ticketId,
    authorType: 'customer',
    authorProfileId: session.profileId,
    body: parsed.data.body,
  })

  if (!ok) return { error: await commonError('saveFailed') }

  // A customer reply always puts the ball back in the operator's court, even
  // from 'resolved' — answering a closed-off thread is how a reopen is asked
  // for, and silently leaving it resolved would drop it out of the queue.
  await setStatus(parsed.data.ticketId, 'open')

  const { data: org } = await createServiceRoleClient()
    .from('organizations')
    .select('name')
    .eq('id', session.orgId)
    .single()

  // 'activity', not 'new': the operator's queue counts genuinely new tickets by
  // notification type, and a reply on an existing thread is not one.
  await notifySuperadmins(
    'support_ticket_activity',
    thread.ticket.subject,
    org?.name ?? session.orgId,
    `/admin/support/${parsed.data.ticketId}`
  )

  revalidatePath(`/support/${parsed.data.ticketId}`)
  revalidatePath('/support')
  return { error: null }
}

// ── Reads for the widget ──────────────────────────────────────────────────────
// The widget shows conversations inline rather than sending people to a page,
// so it needs to fetch them from the client after it opens. Both are scoped to
// the session's org — the orgId is never accepted from the caller.

/** One row in the widget's conversation list. */
export interface WidgetConversation {
  id: string
  subject: string
  status: TicketStatus
  lastMessage: string
  lastMessageAt: string
  /** True when the newest message came from us — "they replied" in the list. */
  awaitingCustomer: boolean
}

export async function fetchMyConversationsAction(): Promise<WidgetConversation[]> {
  const session = await getSession()
  if (!canOpenTickets(session.role)) return []

  const tickets = await listTicketsForOrg(session.orgId, 20)

  const conversations = await Promise.all(
    tickets.map(async (ticket) => {
      const thread = await getTicketWithMessages(ticket.id, session.orgId)
      const last = thread?.messages.at(-1)

      return {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        lastMessage: last?.body ?? ticket.subject,
        lastMessageAt: last?.created_at ?? ticket.created_at,
        awaitingCustomer: last ? last.author_type !== 'customer' : false,
      }
    })
  )

  return conversations
}

export async function fetchConversationAction(
  ticketId: string
): Promise<{ subject: string; status: TicketStatus; messages: SupportTicketMessage[] } | null> {
  const session = await getSession()
  if (!canOpenTickets(session.role)) return null

  const thread = await getTicketWithMessages(ticketId, session.orgId)
  if (!thread) return null

  return {
    subject: thread.ticket.subject,
    status: thread.ticket.status,
    messages: thread.messages,
  }
}
