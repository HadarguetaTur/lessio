'use server'

/**
 * Dev-issue operations — Sprint 32 M3.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { notifyMultiple, getOwnerAndAdminProfileIds } from '@/lib/notifications'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { addMessage, setStatus } from '@/lib/support/tickets'
import { getLinkedTickets, type DevIssueStatus } from '@/lib/superadmin/devIssues'

const STATUSES = ['open', 'investigating', 'fixed', 'wont_fix'] as const

export type AdminActionState = { error: string | null }

const statusSchema = z.object({
  issueId: z.string().uuid(),
  status: z.enum(STATUSES),
})

/**
 * Moves an issue, and when it lands on `fixed` closes the loop with everyone
 * who reported it — a system message on each linked ticket plus a notification.
 *
 * This is the payoff for linking tickets to issues at all: one fix answers
 * every customer who hit the bug, instead of the operator remembering who they
 * were.
 */
export async function setDevIssueStatusAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  await requireSuperAdminSession()

  const parsed = statusSchema.safeParse({
    issueId: formData.get('issue_id'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { error: 'Invalid status' }

  const db = createServiceRoleClient()
  const status = parsed.data.status as DevIssueStatus

  const { error } = await db
    .from('dev_issues')
    .update({
      status,
      resolved_at: status === 'fixed' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.issueId)

  if (error) return { error: error.message }

  if (status === 'fixed') {
    await announceFix(parsed.data.issueId)
  }

  revalidatePath(`/admin/dev-issues/${parsed.data.issueId}`)
  revalidatePath('/admin/dev-issues')
  return { error: null }
}

async function announceFix(issueId: string): Promise<void> {
  const tickets = await getLinkedTickets(issueId)
  if (tickets.length === 0) return

  const db = createServiceRoleClient()

  for (const ticket of tickets) {
    const { data: org } = await db
      .from('organizations')
      .select('default_locale')
      .eq('id', ticket.organization_id)
      .maybeSingle()

    const locale = parseAppLocale(org?.default_locale ?? undefined)
    const t = await getT('support.system', locale)
    const tn = await getT('notifications', locale)

    await addMessage({
      ticketId: ticket.id,
      authorType: 'system',
      body: t('bugFixed'),
    })

    // The customer decides whether it is really solved for them, so the ticket
    // moves to waiting_on_customer rather than straight to resolved.
    if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
      await setStatus(ticket.id, 'waiting_on_customer')
    }

    const recipients = await getOwnerAndAdminProfileIds(ticket.organization_id)
    if (recipients.length > 0) {
      await notifyMultiple(
        ticket.organization_id,
        recipients,
        'dev_issue_fixed',
        tn('devIssueFixed'),
        ticket.subject,
        `/support/${ticket.id}`
      )
    }
  }
}

const linkSchema = z.object({
  ticketId: z.string().uuid(),
  issueId: z.string().uuid().or(z.literal('')),
})

/** Links (or, with an empty issueId, unlinks) a support ticket to a dev issue. */
export async function linkTicketToIssueAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  await requireSuperAdminSession()

  const parsed = linkSchema.safeParse({
    ticketId: formData.get('ticket_id'),
    issueId: formData.get('issue_id') ?? '',
  })
  if (!parsed.success) return { error: 'Invalid link' }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('support_tickets')
    .update({ dev_issue_id: parsed.data.issueId || null })
    .eq('id', parsed.data.ticketId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/support/${parsed.data.ticketId}`)
  revalidatePath('/admin/dev-issues')
  return { error: null }
}
