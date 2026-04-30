'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { confirmCancellationCharge } from '../actions'

interface CancellationEvent {
  id: string
  lesson_id: string
  cancellation_date: string
  hours_before: number
  is_lt_24h: boolean
  is_charged: boolean
  charge_override: number | null
  billing_month: string
}

interface Props {
  event: CancellationEvent
  isOwnerOrAdmin: boolean
}

export function CancellationEventCard({ event, isOwnerOrAdmin }: Props) {
  const t = useTranslations('billing.detail')
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await confirmCancellationCharge(event.id, true)
    })
  }

  function handleReject() {
    startTransition(async () => {
      await confirmCancellationCharge(event.id, false)
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
        <span dir="ltr" className="font-mono text-muted-foreground">
          {event.hours_before.toFixed(1)}h
        </span>
        <p className="text-end font-medium text-foreground">
          {new Date(event.cancellation_date).toLocaleDateString('he-IL')}
        </p>
      </div>
      <dl className="mt-2 space-y-2 text-xs">
        <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
          <dt className="col-start-2 row-start-1 text-end text-muted-foreground">{t('colLt24h')}</dt>
          <dd className="col-start-1 row-start-1">
            {event.is_lt_24h ? (
              <span className="font-medium text-red-600">{t('cancellationYes')}</span>
            ) : (
              <span className="text-muted-foreground">{t('cancellationNo')}</span>
            )}
          </dd>
        </div>
        <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
          <dt className="col-start-2 row-start-1 text-end text-muted-foreground">{t('colChargeApproved')}</dt>
          <dd className="col-start-1 row-start-1">
            {event.is_charged ? (
              <span className="font-medium text-emerald-600">{t('cancellationApproved')}</span>
            ) : (
              <span className="font-medium text-amber-600">{t('cancellationPending')}</span>
            )}
          </dd>
        </div>
        <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
          <dt className="col-start-2 row-start-1 text-end text-muted-foreground">{t('colManualAmount')}</dt>
          <dd className="col-start-1 row-start-1 font-mono text-foreground" dir="ltr">
            {event.charge_override != null ? `₪${event.charge_override}` : '—'}
          </dd>
        </div>
      </dl>
      {isOwnerOrAdmin && !event.is_charged && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            {t('confirmCharge')}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={isPending}
            className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {t('rejectCharge')}
          </button>
        </div>
      )}
    </div>
  )
}
