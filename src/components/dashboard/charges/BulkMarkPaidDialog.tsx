'use client'

/**
 * Marks the charges the tutor ticked as paid.
 *
 * The middle ground between "record payment" (one charge, possibly in part) and
 * "mark whole balance" (one parent, everything): the parent paid for three of
 * this month's five lessons, so those three are ticked and closed together.
 *
 * A selection may span parents — the summary says so, and each parent gets
 * their own confirmation from the server.
 */

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type PaymentMethod } from '@/lib/charges/paymentMethods'
import { type PaymentNotificationStatus } from '@/lib/charges/notificationStatus'
import { summarize, type ChargeSelection } from '@/lib/charges/selection'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { PaymentDetailsFields } from './PaymentDetailsFields'

export interface SettleChargesInput {
  chargeIds: string[]
  method: PaymentMethod
  paymentDate: string
  notes?: string
  /**
   * Whether to WhatsApp each parent a confirmation. Omitted means the server
   * falls back to the org default set at /settings/whatsapp.
   */
  notifyParent?: boolean
}

export interface SettleChargesActionResult {
  error: string | null
  settled?: number
  failed?: number
  notifications?: Record<PaymentNotificationStatus, number>
}

interface BulkMarkPaidDialogProps {
  selection: ChargeSelection
  action: (input: SettleChargesInput) => Promise<SettleChargesActionResult>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful settle, so the caller can clear its selection. */
  onDone: () => void
  /** Org default for the confirmation checkbox, set at /settings/whatsapp. */
  defaultNotifyParent: boolean
}

export function BulkMarkPaidDialog({
  selection,
  action,
  open,
  onOpenChange,
  onDone,
  defaultNotifyParent,
}: BulkMarkPaidDialogProps) {
  const t = useTranslations('charges.bulkPaid')
  const tNotify = useTranslations('charges.notification')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const [method, setMethod] = useState<PaymentMethod>('manual')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [notes, setNotes] = useState('')
  const [notifyParent, setNotifyParent] = useState(defaultNotifyParent)
  const [isPending, startTransition] = useTransition()

  const summary = summarize(selection)
  const money = (amount: number) => formatMoney(amount, locale)

  function handleSubmit() {
    if (summary.count === 0) return

    startTransition(async () => {
      const result = await action({
        chargeIds: [...selection.keys()],
        method,
        paymentDate,
        notes: notes.trim() || undefined,
        notifyParent: summary.anyPhone && notifyParent,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      const settled = result.settled ?? summary.count
      if (result.failed) {
        toast.warning(t('partialFailure', { settled, failed: result.failed }))
      } else {
        const n = result.notifications
        const parts = [t('success', { count: settled })]
        if (n?.queued) parts.push(t('notified', { count: n.queued }))
        if (n?.no_phone) parts.push(tNotify('noPhoneCount', { count: n.no_phone }))
        if (n?.whatsapp_not_connected) parts.push(tNotify('whatsappNotConnected'))
        toast.success(parts.join(' · '))
      }

      onOpenChange(false)
      setNotes('')
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { count: summary.count })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">
            {t('summary', {
              count: summary.count,
              total: money(summary.total),
            })}
          </p>
          {/* Whose money this is — the one thing a multi-parent selection can
              get wrong, so it is spelled out rather than counted. */}
          {summary.parents.length > 1 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.parents.map((p) => `${p.parentName} ${money(p.amount)}`).join(' · ')}
            </p>
          )}
        </div>

        <div className="space-y-3 py-1">
          <PaymentDetailsFields
            idPrefix="bulk-paid"
            method={method}
            onMethodChange={setMethod}
            paymentDate={paymentDate}
            onPaymentDateChange={setPaymentDate}
            notes={notes}
            onNotesChange={setNotes}
            notifyParent={notifyParent}
            onNotifyChange={setNotifyParent}
            showNotify={summary.anyPhone}
            notifyLabel={summary.parents.length > 1 ? t('notifyParents') : undefined}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || summary.count === 0 || !paymentDate}
          >
            {isPending && <Loader2 size={14} className="animate-spin me-2" />}
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
