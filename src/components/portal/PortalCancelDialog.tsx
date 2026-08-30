'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import type { CancelLessonResult } from '@/app/portal/[orgId]/schedule/actions'
import { parseAppLocale } from '@/lib/i18n/locale'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/** What cancelling this lesson will cost, resolved on the server. */
export interface CancelPreview {
  willCharge: boolean
  /** Chargeable but unpriceable — the school settles the amount. */
  unknownAmount: boolean
  /** Formatted, e.g. "₪120.00". Null when there is nothing to charge. */
  amountLabel: string | null
}

export interface CancelTarget {
  id: string
  studentName: string
  dateLabel: string
  timeLabel: string
  cancelPreview: CancelPreview | null
}

interface Props {
  target: CancelTarget | null
  orgId: string
  onClose: () => void
  cancelAction: (lessonId: string) => Promise<CancelLessonResult>
}

/**
 * One instance for the whole schedule, driven by `target`.
 *
 * It deliberately does not live inside the lesson row: cancelling revalidates
 * the schedule, the cancelled lesson leaves the list, and a dialog mounted in
 * that row would unmount mid-flight — taking the "cancelled, ₪120 charged"
 * confirmation with it.
 */
export function PortalCancelDialog({ target, orgId, onClose, cancelAction }: Props) {
  const t = useTranslations('portal.schedule.cancel')
  const tSchedule = useTranslations('portal.schedule')
  const appLocale = parseAppLocale(useLocale())
  const [result, setResult] = useState<CancelLessonResult | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    if (!target) return
    startTransition(async () => {
      setResult(await cancelAction(target.id))
    })
  }

  function handleOpenChange(next: boolean) {
    if (next || isPending) return
    setResult(null)
    onClose()
  }

  const preview = target?.cancelPreview

  return (
    <AlertDialog open={target !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        {result ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className={result.ok ? 'text-green-700' : 'text-red-700'}>
                {result.ok
                  ? result.charged
                    ? tSchedule('cancelledWithCharge', {
                        amount: formatCurrency(result.amount, appLocale, 2),
                      })
                    : tSchedule('cancelledOk')
                  : tSchedule(`errors.${result.error}`)}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {/* An expired session is not a permissions problem, and "close"
                  leaves the parent stuck on a screen that will keep failing. */}
              {!result.ok && result.error === 'unauthorized' && (
                <a
                  href={`/portal/${orgId}/login`}
                  className="min-h-11 px-4 inline-flex items-center justify-center text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {t('signIn')}
                </a>
              )}
              <button
                onClick={() => handleOpenChange(false)}
                className="min-h-11 px-4 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                {t('close')}
              </button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500 shrink-0" aria-hidden />
                <AlertDialogTitle>{t('title')}</AlertDialogTitle>
              </div>
              <AlertDialogDescription>
                {t.rich('confirmBody', {
                  name: target?.studentName ?? '',
                  date: target?.dateLabel ?? '',
                  time: target?.timeLabel ?? '',
                  b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {/* The amount, before the parent commits — not after. */}
            <p className="text-sm">
              {!preview || !preview.willCharge ? (
                <span className="text-green-700">{t('noCharge')}</span>
              ) : preview.unknownAmount ? (
                <span className="text-amber-700">{t('chargeUnknown')}</span>
              ) : (
                <span className="text-amber-700 font-medium">
                  {t('chargeAmount', { amount: preview.amountLabel ?? '' })}
                </span>
              )}
            </p>

            <AlertDialogFooter>
              <button
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
                className="flex-1 min-h-11 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors disabled:opacity-50"
              >
                {t('back')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 min-h-11 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isPending ? t('cancelling') : t('confirm')}
              </button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
