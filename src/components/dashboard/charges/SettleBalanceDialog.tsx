'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CheckCheck, Loader2 } from 'lucide-react'
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
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { paymentToast, type ManualPaymentResult } from './RecordPaymentDialog'
import { PaymentDetailsFields } from './PaymentDetailsFields'

export interface SettleBalanceInput {
  parentId: string
  method: PaymentMethod
  notes?: string
  notifyParent?: boolean
}

export interface SettleBalanceResult extends ManualPaymentResult {
  settled?: number
  failed?: number
}

interface SettleBalanceDialogProps {
  parentId: string
  parentName: string
  /** The parent's whole open balance — every open charge, not just the rows on screen. */
  total: number
  chargeCount: number
  /** Hides the confirmation checkbox when there is nobody to message. */
  parentHasPhone: boolean
  action: (input: SettleBalanceInput) => Promise<SettleBalanceResult>
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'default'
  /** Overrides the built-in button's label — for rows where the long form does not fit. */
  triggerLabel?: string
  /**
   * Drive the dialog from outside and drop the built-in button — for callers
   * that open it from a menu item, where the trigger must not live inside the
   * menu (closing the menu would unmount the dialog with it).
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Marks every open charge of one parent as paid, in one confirmation.
 *
 * "Record payment" stays the tool for a partial payment or a single lesson;
 * this is for the parent who hands over the whole month at once.
 */
export function SettleBalanceDialog({
  parentId,
  parentName,
  total,
  chargeCount,
  parentHasPhone,
  action,
  variant = 'outline',
  size = 'sm',
  triggerLabel,
  open: controlledOpen,
  onOpenChange,
}: SettleBalanceDialogProps) {
  const t = useTranslations('charges.settleBalance')
  const tNotify = useTranslations('charges.notification')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const [method, setMethod] = useState<PaymentMethod>('manual')
  const [notes, setNotes] = useState('')
  const [notifyParent, setNotifyParent] = useState(true)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => {
      const result = await action({
        parentId,
        method,
        notes: notes.trim() || undefined,
        notifyParent: parentHasPhone && notifyParent,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      const settled = result.settled ?? chargeCount
      if (result.failed) {
        toast.warning(t('partialFailure', { settled, failed: result.failed }))
      } else {
        toast.success(paymentToast(t('success', { count: settled }), result.notification, tNotify))
      }
      setOpen(false)
      setNotes('')
    })
  }

  return (
    <>
      {!isControlled && (
        <Button
          variant={variant}
          size={size}
          className="gap-1.5 text-emerald-700 hover:text-emerald-800"
          onClick={() => setOpen(true)}
        >
          <CheckCheck size={14} />
          {triggerLabel ?? t('action')}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description', { name: parentName })}</DialogDescription>
          </DialogHeader>

          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
            {t('summary', { count: chargeCount, total: formatMoney(total, locale) })}
          </p>

          <div className="space-y-3 py-1">
            <PaymentDetailsFields
              idPrefix="settle"
              method={method}
              onMethodChange={setMethod}
              notes={notes}
              onNotesChange={setNotes}
              notifyParent={notifyParent}
              onNotifyChange={setNotifyParent}
              showNotify={parentHasPhone}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {tCommon('actions.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 size={14} className="animate-spin me-2" />}
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
