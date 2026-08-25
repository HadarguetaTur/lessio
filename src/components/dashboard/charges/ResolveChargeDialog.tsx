'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Ban, CircleSlash, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type ResolveMode = 'waive' | 'void'

interface ResolveChargeDialogProps {
  chargeId: string
  mode: ResolveMode
  action: (chargeId: string, reason: string) => Promise<{ error: string | null }>
  /** Warn that a link already sent to the parent stays live at the provider. */
  hasPaymentLink?: boolean
  /** Warn that an issued invoice needs a credit note to be reversed properly. */
  hasInvoice?: boolean
  size?: 'sm' | 'default'
}

export function ResolveChargeDialog({
  chargeId,
  mode,
  action,
  hasPaymentLink = false,
  hasInvoice = false,
  size = 'sm',
}: ResolveChargeDialogProps) {
  const t = useTranslations('charges.resolve')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  // Keys are picked by mode at runtime, which next-intl's literal key types
  // cannot narrow.
  const tm = (key: string) => t(`${mode}.${key}` as Parameters<typeof t>[0])
  const Icon = mode === 'waive' ? CircleSlash : Ban

  function handleSubmit() {
    const trimmed = reason.trim()
    if (!trimmed) return

    startTransition(async () => {
      const result = await action(chargeId, trimmed)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(tm('success'))
      setOpen(false)
      setReason('')
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Icon size={14} />
        {tm('action')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tm('title')}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">{tm('description')}</p>

          {hasInvoice && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('invoiceWarning')}
            </p>
          )}
          {hasPaymentLink && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('paymentLinkWarning')}
            </p>
          )}

          <div className="space-y-1.5 py-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t('reasonLabel')}
            </label>
            <Textarea
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
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={isPending || !reason.trim()}
            >
              {isPending && <Loader2 size={14} className="animate-spin me-2" />}
              {tm('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
