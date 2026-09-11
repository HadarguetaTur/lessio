import { getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { ProspectStatusBadge } from '@/components/admin/ProspectStatusBadge'
import { mergeTimeline, type LeadCardData } from '@/lib/outbound/leadCard'
import { OUTBOUND_TIMEZONE } from '@/lib/outbound/mailboxes'
import { cn } from '@/lib/utils'

/**
 * The whole conversation, oldest first, as chat bubbles: what we sent on the
 * end side, what they wrote on the start side (logical sides, so RTL mirrors
 * for free). The founder's own actions on the lead sit between the bubbles
 * as quiet chips, so "I marked this contacted on Tuesday" reads in context.
 */
export async function ConversationThread({
  data,
  locale,
}: {
  data: LeadCardData
  locale: string
}) {
  const t = await getTranslations('admin.leads.card')
  const tLeads = await getTranslations('admin.leads')
  const tOut = await getTranslations('admin.outbound')
  const items = mergeTimeline(data.thread, data.events)
  const when = (iso: string) =>
    DateTime.fromISO(iso).setZone(OUTBOUND_TIMEZONE).setLocale(locale).toFormat('dd.MM HH:mm')

  return (
    <section className="px-5 py-4">
      <h3 className="mb-3 text-xs font-medium text-muted-foreground">{t('thread')}</h3>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t('noThread')}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => {
            if (item.kind === 'event') {
              const { event } = item
              const p = event.payload
              let label: string
              if (event.type === 'status_change') {
                const from = String(p.from ?? '')
                const to = String(p.to ?? '')
                label = t('statusChangedEvent', {
                  from: tLeads.has(`status.${from}`) ? tLeads(`status.${from}`) : from,
                  to: tLeads.has(`status.${to}`) ? tLeads(`status.${to}`) : to,
                })
              } else if (event.type === 'note' && p.nextActionAt) {
                label = t('nextActionEvent', { when: when(String(p.nextActionAt)) })
              } else if (event.type === 'note') {
                label = t('noteEvent')
              } else {
                label = event.type
              }
              return (
                <li key={`e-${event.id}`} className="flex justify-center">
                  <span className="rounded-full border border-dashed border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
                    {label} · {when(event.created_at)}
                  </span>
                </li>
              )
            }

            const { message } = item
            const mine = message.direction === 'out'
            const failed = Boolean(message.error)
            return (
              <li key={message.id} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[88%] whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed',
                    mine
                      ? 'rounded-2xl rounded-ee-md bg-primary text-primary-foreground'
                      : 'rounded-2xl rounded-es-md border border-border bg-card text-foreground',
                    failed && 'border border-destructive/40 bg-destructive/10 text-foreground'
                  )}
                >
                  {message.subject && mine && (
                    <div className={cn('mb-1 text-xs font-semibold', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                      {message.subject}
                    </div>
                  )}
                  {message.body ?? (
                    <span className={cn('text-xs', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      {t(`kind.${message.kind}`)}
                    </span>
                  )}
                  {failed && <div className="mt-1 text-xs text-destructive">{message.error}</div>}
                </div>
                <span className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                  {t(`kind.${message.kind}`)}
                  {!mine && message.classification && (
                    <ProspectStatusBadge
                      status={message.classification}
                      label={tOut(`classification.${message.classification}`)}
                    />
                  )}
                  {!mine && !message.reviewed_at && (message.classification === 'unknown' || message.classification === 'unmatched') && (
                    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                      {t('needsLook')}
                    </span>
                  )}
                  <span>· {when(message.created_at)}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {data.prospect?.next_followup_at && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t('followupScheduled', { when: when(data.prospect.next_followup_at) })}
        </p>
      )}
    </section>
  )
}
