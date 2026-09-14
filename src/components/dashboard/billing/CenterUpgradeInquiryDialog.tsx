'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { submitCenterUpgradeInquiryAction } from '@/app/(dashboard)/account/billing/upgrade-actions'
import type { CenterInquiryCopy } from '@/components/marketing/CenterPlanInquiryDialog'

export function CenterUpgradeInquiryDialog({
  copy,
  locale,
  initialName = '',
  initialPhone = '',
}: {
  copy: CenterInquiryCopy
  locale: string
  initialName?: string
  initialPhone?: string
}) {
  const isHe = locale === 'he'
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setError(null); setSent(false) } }}>
      <DialogTrigger asChild><Button type="button" variant="outline">{copy.cta}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md" dir={isHe ? 'rtl' : 'ltr'}>
        <DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.body}</DialogDescription></DialogHeader>
        {sent ? <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{copy.success}</p> : (
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            setError(null)
            startTransition(async () => {
              const result = await submitCenterUpgradeInquiryAction({ contactName: String(form.get('name') ?? ''), phone: String(form.get('phone') ?? '') })
              if ('ok' in result) setSent(true)
              else setError(copy.error)
            })
          }}>
            <label className="block text-sm font-medium">{copy.name}<input required name="name" defaultValue={initialName} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" /></label>
            <label className="block text-sm font-medium">{copy.phone}<input required name="phone" defaultValue={initialPhone} type="tel" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" /></label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" disabled={pending} type="submit">{copy.submit}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
