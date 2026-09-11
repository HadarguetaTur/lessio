import { getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'
import { PauseCircle, PlayCircle } from 'lucide-react'

import { AttentionList, type AttentionListItem } from '@/components/admin/AttentionList'
import { OUTBOUND_TIMEZONE } from '@/lib/outbound/mailboxes'
import type { OutboundCockpit as Cockpit } from '@/lib/outbound/stats'
import { cn } from '@/lib/utils'

/**
 * The landing tab of /admin/outbound: is the machine running, what is waiting
 * for a person, and four numbers. Nothing here is a form.
 */
export async function OutboundCockpit({
  cockpit,
  locale,
  hrefs,
}: {
  cockpit: Cockpit
  locale: string
  hrefs: { openers: string; replies: string; newLeads: string; dueActions: string; settings: string }
}) {
  const t = await getTranslations('admin.outbound.cockpit')

  const items: AttentionListItem[] = []
  for (const err of cockpit.mailboxErrors) {
    items.push({
      key: `mailbox-${err.id}`,
      severity: 'critical',
      href: hrefs.settings,
      title: t('items.mailboxError', { email: err.email, error: err.last_error.slice(0, 80) }),
    })
  }
  if (cockpit.dueNextActions > 0) {
    items.push({ key: 'due', severity: 'warning', href: hrefs.dueActions, title: t('items.dueActions', { count: cockpit.dueNextActions }) })
  }
  if (cockpit.repliesToReview > 0) {
    items.push({ key: 'replies', severity: 'warning', href: hrefs.replies, title: t('items.replies', { count: cockpit.repliesToReview }) })
  }
  if (cockpit.newLeads > 0) {
    items.push({ key: 'leads', severity: 'info', href: hrefs.newLeads, title: t('items.newLeads', { count: cockpit.newLeads }) })
  }
  if (cockpit.openersToReview > 0) {
    items.push({ key: 'openers', severity: 'info', href: hrefs.openers, title: t('items.openers', { count: cockpit.openersToReview }) })
  }

  const { sending } = cockpit
  const stalled = sending.activeMailboxes === 0 || sending.remainingCapacity === 0
  let sendingLine: string
  if (sending.active && !stalled) sendingLine = t('sendingActive', { remaining: sending.remainingCapacity })
  else if (stalled) sendingLine = t('noMailboxCapacity')
  else {
    const when = sending.nextWindowStart
      ? DateTime.fromISO(sending.nextWindowStart).setZone(OUTBOUND_TIMEZONE).setLocale(locale).toFormat('cccc HH:mm')
      : '—'
    sendingLine = t('sendingResumes', { when })
  }
  const SendIcon = sending.active && !stalled ? PlayCircle : PauseCircle

  const stat = (label: string, value: number) => (
    <div className="rounded-xl border border-border bg-background p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <p
        className={cn(
          'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
          stalled
            ? 'border-destructive/30 bg-destructive/5 text-destructive'
            : sending.active
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
              : 'border-border bg-muted/40 text-muted-foreground'
        )}
      >
        <SendIcon size={16} />
        {sendingLine}
      </p>

      <AttentionList title={t('waitingTitle')} items={items} emptyLabel={t('allClear')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(t('queued'), cockpit.queued)}
        {stat(t('sentToday'), cockpit.sentToday)}
        {stat(t('repliesToday'), cockpit.repliesToday)}
        {stat(t('interested7d'), cockpit.interested7d)}
      </div>
    </div>
  )
}
