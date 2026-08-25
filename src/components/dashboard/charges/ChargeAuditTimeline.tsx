'use client'

import { useFormatter, useTranslations } from 'next-intl'
import type { ChargeAuditRow } from '@/lib/charges/audit'

interface ChargeAuditTimelineProps {
  entries: ChargeAuditRow[]
}

export function ChargeAuditTimeline({ entries }: ChargeAuditTimelineProps) {
  const t = useTranslations('charges.audit')
  const format = useFormatter()

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t(`events.${entry.event_type}` as Parameters<typeof t>[0])}
            </p>
            <p className="text-xs text-muted-foreground">
              {format.dateTime(new Date(entry.created_at), {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
              {' · '}
              {entry.actor_name ?? t('systemActor')}
            </p>
            {entry.reason && (
              <p className="mt-1 text-xs text-foreground/80">{entry.reason}</p>
            )}
            {entry.before_amount != null &&
              entry.after_amount != null &&
              entry.before_amount !== entry.after_amount && (
                <p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">
                  ₪{entry.before_amount.toFixed(2)} → ₪{entry.after_amount.toFixed(2)}
                </p>
              )}
          </div>
        </li>
      ))}
    </ol>
  )
}
