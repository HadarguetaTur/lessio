'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Ban, Loader2 } from 'lucide-react'

interface IssueCreditNoteDialogProps {
  billingId: string
  hasInvoice: boolean
  hasCreditNote: boolean
  issueCreditNoteAction: (billingId: string, reason: string) => Promise<{ error: string | null }>
}

export default function IssueCreditNoteDialog({
  billingId,
  hasInvoice,
  hasCreditNote,
  issueCreditNoteAction,
}: IssueCreditNoteDialogProps) {
  const t = useTranslations('billing.creditNote')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  if (!hasInvoice || hasCreditNote) return null

  function handleSubmit() {
    if (!reason.trim()) return
    startTransition(async () => {
      const result = await issueCreditNoteAction(billingId, reason.trim())
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('number'))
        setOpen(false)
        setReason('')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-2">
          <Ban size={14} />
          {t('issue')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('confirmMessage')}</p>
        <div className="space-y-2 py-2">
          <Textarea
            placeholder={t('reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {t('issue')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isPending || !reason.trim()}
          >
            {isPending ? <Loader2 size={14} className="animate-spin me-2" /> : null}
            {isPending ? t('issuing') : t('issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
