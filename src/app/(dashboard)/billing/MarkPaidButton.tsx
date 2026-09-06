'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { markBillingAsPaid } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  billingId: string
}

export function MarkPaidButton({ billingId }: Props) {
  const t = useTranslations('billing.detail')
  const tPayment = useTranslations('charges.recordPayment')
  const tCommon = useTranslations('common.actions')
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() => new Date().toLocaleDateString('en-CA'))

  function handleClick() {
    startTransition(async () => {
      // The action refuses an unapproved record; without this the click was a
      // no-op the owner could not distinguish from success (UX audit 8, F-H1).
      const result = await markBillingAsPaid(billingId, paymentDate)
      if (result?.error) toast.error(result.error)
      else {
        toast.success(t('markedPaid'))
        setOpen(false)
      }
    })
  }

  return (
    <>
      <button
        onClick={() => {
          setPaymentDate(new Date().toLocaleDateString('en-CA'))
          setOpen(true)
        }}
        disabled={isPending}
        className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-50"
      >
        {t('markAsPaid')}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('markAsPaid')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label
              htmlFor={`billing-payment-date-${billingId}`}
              className="text-xs font-medium text-muted-foreground"
            >
              {tPayment('dateLabel')}
            </label>
            <Input
              id={`billing-payment-date-${billingId}`}
              type="date"
              value={paymentDate}
              max={new Date().toLocaleDateString('en-CA')}
              onChange={(event) => setPaymentDate(event.target.value)}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">{tPayment('dateHint')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleClick} disabled={isPending || !paymentDate}>
              {t('markAsPaid')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
