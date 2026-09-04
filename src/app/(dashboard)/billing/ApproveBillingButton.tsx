'use client'

/**
 * Approve a monthly bill.
 *
 * Approval is the primary money commit of the month-end journey and it is
 * irreversible: once approved the figures freeze (recalculation is refused),
 * a ledger charge is created, an invoice is issued and — where the org is
 * configured for it — the parent is messaged. UX audit 8 found it firing on a
 * bare click with no consequence statement and no feedback at all, while the
 * sibling /charges surfaces state the consequence and toast the outcome. This
 * ports that standard onto it.
 */

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { approveBillingAction } from './actions'

interface Props {
  billingId: string
  /** Named in the confirmation so a mis-clicked row is caught before the commit. */
  studentName?: string
  /** Preformatted in the caller's locale. */
  amountLabel?: string
}

export function ApproveBillingButton({ billingId, studentName, amountLabel }: Props) {
  const t = useTranslations('billing')
  const tCommon = useTranslations('common')
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function handleConfirm() {
    startTransition(async () => {
      const result = await approveBillingAction(billingId)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('approveSuccess'))
      setOpen(false)
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isPending ? t('approving') : t('approve')}
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {studentName && amountLabel
                ? t('approveConfirm.titleNamed', { name: studentName, amount: amountLabel })
                : t('approveConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('approveConfirm.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{tCommon('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={(e) => { e.preventDefault(); handleConfirm() }} disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin me-2" />}
                {t('approveConfirm.confirm')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
