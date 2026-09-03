'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Coins, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type PaymentMethod } from '@/lib/charges/paymentMethods'
import { type PaymentNotificationStatus } from '@/lib/charges/notificationStatus'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { PaymentDetailsFields } from './PaymentDetailsFields'

export interface RecordPaymentInput {
  chargeId: string
  amount: number
  method: PaymentMethod
  notes?: string
  /**
   * Whether to WhatsApp the parent a confirmation. Omitted means the server
   * falls back to the org default set at /settings/whatsapp.
   */
  notifyParent?: boolean
}

export interface ManualPaymentResult {
  error: string | null
  notification?: PaymentNotificationStatus
}

/**
 * The toast for a manual payment: the outcome, plus what happened to the
 * parent confirmation when it was asked for and could not go out.
 */
export function paymentToast(
  base: string,
  notification: PaymentNotificationStatus | undefined,
  /** A translator scoped to `charges.notification`. */
  notifyLabel: (key: 'queued' | 'noPhone' | 'whatsappNotConnected') => string
): string {
  switch (notification) {
    case 'queued':
      return `${base} · ${notifyLabel('queued')}`
    case 'no_phone':
      return `${base} · ${notifyLabel('noPhone')}`
    case 'whatsapp_not_connected':
      return `${base} · ${notifyLabel('whatsappNotConnected')}`
    default:
      return base
  }
}

interface RecordPaymentDialogProps {
  chargeId: string
  /** What is still owed — the default and the maximum. */
  remaining: number
  /** Hides the confirmation checkbox when there is nobody to message. */
  parentHasPhone?: boolean
  /** Org default for the confirmation checkbox, set at /settings/whatsapp. */
  defaultNotifyParent: boolean
  action: (input: RecordPaymentInput) => Promise<ManualPaymentResult>
}

export function RecordPaymentDialog({
  chargeId,
  remaining,
  parentHasPhone = true,
  defaultNotifyParent,
  action,
}: RecordPaymentDialogProps) {
  const t = useTranslations('charges.recordPayment')
  const tNotify = useTranslations('charges.notification')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const money = (amount: number) => formatMoney(amount, locale)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(remaining))
  const [method, setMethod] = useState<PaymentMethod>('manual')
  const [notes, setNotes] = useState('')
  const [notifyParent, setNotifyParent] = useState(defaultNotifyParent)
  const [isPending, startTransition] = useTransition()

  const parsedAmount = Number(amount)
  const isValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= remaining
  const isPartial = isValid && parsedAmount < remaining

  function handleSubmit() {
    if (!isValid) return

    startTransition(async () => {
      const result = await action({
        chargeId,
        amount: parsedAmount,
        method,
        notes: notes.trim() || undefined,
        notifyParent: parentHasPhone && notifyParent,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(
        paymentToast(isPartial ? t('successPartial') : t('successFull'), result.notification, tNotify)
      )
      setOpen(false)
      setNotes('')
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-emerald-700 hover:text-emerald-800"
        onClick={() => {
          setAmount(String(remaining))
          setOpen(true)
        }}
      >
        <Coins size={14} />
        {t('action')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {t('remaining', { amount: remaining.toFixed(2) })}
          </p>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="payment-amount">
                {t('amountLabel')}
              </label>
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
              {amount !== '' && !isValid && (
                <p className="text-xs text-red-600">
                  {t('invalidAmount', { max: money(remaining) })}
                </p>
              )}
            </div>

            <PaymentDetailsFields
              idPrefix="payment"
              method={method}
              onMethodChange={setMethod}
              notes={notes}
              onNotesChange={setNotes}
              notifyParent={notifyParent}
              onNotifyChange={setNotifyParent}
              showNotify={parentHasPhone}
            />

            {isPartial && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t('partialHint', { balance: money(remaining - parsedAmount) })}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {tCommon('actions.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !isValid}>
              {isPending && <Loader2 size={14} className="animate-spin me-2" />}
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
