'use server'

/**
 * Operator-side support actions — Sprint 32 M1.
 *
 * Every action here answers a customer, so each one both writes to the thread
 * and tells the customer something changed. The reply notification is the only
 * channel in M1: WhatsApp outside the 24h window needs a Meta-approved template
 * and platform email has no sender yet.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requirePlatformSession } from '@/lib/superadmin/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { notifyMultiple, getOwnerAndAdminProfileIds } from '@/lib/notifications'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import {
  addMessage,
  getTicketWithMessages,
  setStatus,
  type TicketStatus,
} from '@/lib/support/tickets'

const STATUSES = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'] as const

const replySchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
})

export type AdminActionState = { error: string | null }

/**
 * Posts the operator's answer and pings the customer.
 *
 * Replying moves an open ticket to 'waiting_on_customer' — the queue's default
 * filter still shows it, but the operator can see at a glance which threads are
 * waiting on them versus on someone else. A reply to an already-resolved ticket
 * leaves the status alone.
 */
export async function replyToTicketAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const session = await requirePlatformSession('support.reply')

  const parsed = replySchema.safeParse({
    ticketId: formData.get('ticket_id'),
    body: formData.get('body'),
  })
  if (!parsed.success) return { error: 'Invalid reply' }

  const thread = await getTicketWithMessages(parsed.data.ticketId)
  if (!thread) return { error: 'Ticket not found' }

  // Attribute the reply. addMessage has always accepted authorProfileId; the
  // admin path never passed it, so every operator reply was an anonymous
  // 'admin' — unreadable the moment more than one person works the queue.
  const ok = await addMessage({
    ticketId: parsed.data.ticketId,
    authorType: 'admin',
    authorProfileId: session.profileId,
    body: parsed.data.body,
  })
  if (!ok) return { error: 'Failed to save reply' }

  if (thread.ticket.status === 'open' || thread.ticket.status === 'in_progress') {
    await setStatus(parsed.data.ticketId, 'waiting_on_customer')
  }

  await notifyTicketOrg(
    thread.ticket.organization_id,
    parsed.data.ticketId,
    'support_ticket_reply',
    thread.ticket.subject
  )

  revalidatePath(`/admin/support/${parsed.data.ticketId}`)
  revalidatePath('/admin/support')
  return { error: null }
}

const statusSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(STATUSES),
})

export async function setTicketStatusAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  await requirePlatformSession('support.reply')

  const parsed = statusSchema.safeParse({
    ticketId: formData.get('ticket_id'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { error: 'Invalid status' }

  const thread = await getTicketWithMessages(parsed.data.ticketId)
  if (!thread) return { error: 'Ticket not found' }

  const ok = await setStatus(parsed.data.ticketId, parsed.data.status as TicketStatus)
  if (!ok) return { error: 'Failed to update status' }

  // Only resolution is worth interrupting the customer for. Internal moves
  // ('in_progress', 'closed') are operator bookkeeping and stay silent.
  if (parsed.data.status === 'resolved') {
    await notifyTicketOrg(
      thread.ticket.organization_id,
      parsed.data.ticketId,
      'support_ticket_resolved',
      thread.ticket.subject
    )
  }

  revalidatePath(`/admin/support/${parsed.data.ticketId}`)
  revalidatePath('/admin/support')
  return { error: null }
}

/**
 * Notifies the org's owners and admins, not just the person who filed it: the
 * owner who raised a billing ticket may well be on holiday when the answer
 * lands, and anyone with the same permissions can act on it.
 *
 * One title for several recipients, so it follows the org's language rather
 * than any single reader's — same rule as the day-off notifications.
 */
async function notifyTicketOrg(
  orgId: string,
  ticketId: string,
  type: 'support_ticket_reply' | 'support_ticket_resolved',
  subject: string
): Promise<void> {
  const recipients = await getOwnerAndAdminProfileIds(orgId)
  if (recipients.length === 0) return

  const { data: org } = await createServiceRoleClient()
    .from('organizations')
    .select('default_locale')
    .eq('id', orgId)
    .maybeSingle()

  const locale = parseAppLocale(org?.default_locale ?? undefined)
  const tn = await getT('notifications', locale)
  const titleKey = type === 'support_ticket_reply' ? 'supportTicketReply' : 'supportTicketResolved'

  await notifyMultiple(orgId, recipients, type, tn(titleKey), subject, `/support/${ticketId}`)
}
