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

export function CancellationEventRow({ event, isOwnerOrAdmin }: Props) {
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
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 text-sm text-foreground">
        {new Date(event.cancellation_date).toLocaleDateString('he-IL')}
      </td>
      <td className="px-4 py-2.5 text-sm font-mono text-foreground" dir="ltr">
        {event.hours_before.toFixed(1)}h
      </td>
      <td className="px-4 py-2.5 text-sm">
        {event.is_lt_24h ? (
          <span className="text-red-600 font-medium">{t('cancellationYes')}</span>
        ) : (
          <span className="text-muted-foreground">{t('cancellationNo')}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-sm">
        {event.is_charged ? (
          <span className="text-emerald-700 font-medium">{t('cancellationApproved')}</span>
        ) : (
          <span className="text-amber-600 font-medium">{t('cancellationPending')}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-sm font-mono text-foreground" dir="ltr">
        {event.charge_override != null ? `₪${event.charge_override}` : '—'}
      </td>
      {isOwnerOrAdmin && (
        <td className="px-4 py-2.5">
          {!event.is_charged ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                {t('confirmCharge')}
              </button>
              <button
                onClick={handleReject}
                disabled={isPending}
                className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {t('rejectCharge')}
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}
    </tr>
  )
}
