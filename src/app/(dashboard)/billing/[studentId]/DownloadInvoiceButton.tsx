'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'

interface DownloadInvoiceButtonProps {
  billingId: string
  hasInvoice: boolean
  downloadAction: (billingId: string) => Promise<{ error: string | null; url: string | null }>
}

export default function DownloadInvoiceButton({
  billingId,
  hasInvoice,
  downloadAction,
}: DownloadInvoiceButtonProps) {
  const t = useTranslations('billing.invoice')
  const [isPending, startTransition] = useTransition()

  if (!hasInvoice) return null

  function handleDownload() {
    startTransition(async () => {
      const result = await downloadAction(billingId)
      if (result.url) {
        window.open(result.url, '_blank')
      }
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={isPending} className="gap-2">
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      {t('download')}
    </Button>
  )
}
