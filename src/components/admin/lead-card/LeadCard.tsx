import { getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { OpenerRow } from '@/components/admin/OutboundOpenerReview'
import type { LeadCardData } from '@/lib/outbound/leadCard'
import { OUTBOUND_TIMEZONE } from '@/lib/outbound/mailboxes'
import type { LeadActionState } from '@/app/(admin)/admin/leads/actions'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'
import { ConversationThread } from './ConversationThread'
import { LeadCardHeader } from './LeadCardHeader'
import { LeadNextActionForm } from './LeadNextActionForm'
import { LeadNotesForm } from './LeadNotesForm'
import { LeadStatusControls } from './LeadStatusControls'
import { ProspectActions } from './ProspectActions'

type LeadAction = (prev: LeadActionState | null, formData: FormData) => Promise<LeadActionState>
type OutboundAction = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

export interface LeadCardActions {
  setStatus: LeadAction
  saveNotes: LeadAction
  setNextAction: LeadAction
  createLead: LeadAction
  suppress: OutboundAction
  markReviewed: OutboundAction
  approveOpener: OutboundAction
  regenerateOpener: OutboundAction
}

/**
 * The one card both screens open. Server component: it only lays the pieces
 * out; every write goes through an action handed in as a prop.
 */
export async function LeadCard({
  data,
  locale,
  now,
  actions,
}: {
  data: LeadCardData
  locale: string
  now: Date
  actions: LeadCardActions
}) {
  const t = await getTranslations('admin.leads.card')
  const { lead, prospect } = data

  const nextActionLocal = lead?.next_action_at
    ? DateTime.fromISO(lead.next_action_at).setZone(OUTBOUND_TIMEZONE).toFormat("yyyy-MM-dd'T'HH:mm")
    : ''
  const due = Boolean(lead?.next_action_at && DateTime.fromISO(lead.next_action_at) <= DateTime.fromJSDate(now))
  const unreviewed = data.thread.filter(
    (m) => m.direction === 'in' && !m.reviewed_at && (m.classification === 'unknown' || m.classification === 'unmatched')
  ).length
  const openerPending = prospect ? ['pending', 'generated', 'failed'].includes(prospect.opener_status) : false

  return (
    <div className="flex flex-col">
      <LeadCardHeader data={data} />

      {lead && (
        <section className="flex flex-col gap-4 border-b border-border px-5 py-4">
          <LeadStatusControls
            leadId={lead.id}
            current={lead.status}
            lostReason={lead.lost_reason}
            setStatus={actions.setStatus}
          />
          {lead.status !== 'won' && lead.status !== 'lost' && (
            <LeadNextActionForm
              leadId={lead.id}
              nextActionLocal={nextActionLocal}
              note={lead.next_action_note}
              due={due}
              action={actions.setNextAction}
            />
          )}
        </section>
      )}

      {prospect && (
        <section className="flex flex-col gap-3 border-b border-border px-5 py-4">
          {openerPending && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">{t('openerWaiting')}</p>
              <ul>
                <OpenerRow
                  row={{
                    id: prospect.id,
                    email: prospect.email,
                    first_name: prospect.first_name,
                    company: prospect.company,
                    source_url: prospect.source_url,
                    opener_status: prospect.opener_status,
                    opener_generated: prospect.opener_generated,
                    opener_error: prospect.opener_error,
                  }}
                  approveAction={actions.approveOpener}
                  regenerateAction={actions.regenerateOpener}
                />
              </ul>
            </div>
          )}
          <ProspectActions
            prospectId={prospect.id}
            hasLead={Boolean(lead)}
            unreviewedReplies={unreviewed}
            suppressed={prospect.status === 'suppressed' || prospect.status === 'unsubscribed'}
            createLead={actions.createLead}
            suppress={actions.suppress}
            markReviewed={actions.markReviewed}
          />
        </section>
      )}

      {lead && (
        <section className="border-b border-border px-5 py-4">
          <LeadNotesForm leadId={lead.id} notes={lead.notes} action={actions.saveNotes} />
        </section>
      )}

      <ConversationThread data={data} locale={locale} />
    </div>
  )
}
