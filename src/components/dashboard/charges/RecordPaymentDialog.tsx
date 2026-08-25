'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Coins, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/charges/paymentMethods'

export interface RecordPaymentInput {
  chargeId: string
  amount: number
  method: PaymentMethod
  notes?: string
}

interface RecordPaymentDialogProps {
  chargeId: string
  /** What is still owed — the default and the maximum. */
  remaining: number
  action: (input: RecordPaymentInput) => Promise<{ error: string | null }>
}

export function RecordPaymentDialog({ chargeId, remaining, action }: RecordPaymentDialogProps) {
  const t = useTranslations('charges.recordPayment')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(remaining))
  const [method, setMethod] = useState<PaymentMethod>('manual')
  const [notes, setNotes] = useState('')
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
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(isPartial ? t('successPartial') : t('successFull'))
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
                  {t('invalidAmount', { max: remaining.toFixed(2) })}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="payment-method">
                {t('methodLabel')}
              </label>
              <select
                id="payment-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`methods.${m}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={2}
              maxLength={500}
            />

            {isPartial && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t('partialHint', { balance: (remaining - parsedAmount).toFixed(2) })}
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
