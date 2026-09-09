'use client'

/**
 * Records that money was sent back to the parent.
 *
 * Deliberately not a "refund" button: Lessio does not move money and does not
 * issue the credit note (decision #37 — tax documents come from the licensed
 * receipt provider). This records the fact so the revenue figures stop
 * counting it and the parent portal stops saying "paid". The copy says so.
 */

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Undo2 } from 'lucide-react'
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

interface Props {
  chargeId: string
  /** What was actually collected — the ceiling on the refund. */
  amountPaid: number
  /** An issued receipt needs a credit note from the receipt provider. */
  hasReceipt: boolean
  action: (input: {
    chargeId: string
    amount?: number
    reason: string
  }) => Promise<{ error: string | null }>
}

export function MarkRefundedDialog({ chargeId, amountPaid, hasReceipt, action }: Props) {
  const t = useTranslations('charges.refund')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(amountPaid))
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const parsed = Number(amount)
  const amountValid = Number.isFinite(parsed) && parsed > 0 && parsed <= amountPaid + 0.005

  function handleSubmit() {
    const trimmed = reason.trim()
    if (!trimmed || !amountValid) return

    startTransition(async () => {
      const result = await action({ chargeId, amount: parsed, reason: trimmed })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('success'))
      setOpen(false)
      setReason('')
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Undo2 size={14} />
        {t('action')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">{t('description')}</p>

          {hasReceipt && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('receiptWarning')}
            </p>
          )}

          <div className="space-y-1.5 py-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="refund-amount">
              {t('amountLabel', { max: amountPaid })}
            </label>
            <Input
              id="refund-amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={amountPaid}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5 py-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="refund-reason">
              {t('reasonLabel')}
            </label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
              rows={3}
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {tCommon('actions.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !reason.trim() || !amountValid}>
              {isPending && <Loader2 size={14} className="animate-spin me-2" />}
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
