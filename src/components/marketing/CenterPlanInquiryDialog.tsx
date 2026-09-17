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
import { submitPublicCenterPlanInquiry, type CenterInquiryResult } from '@/app/center-inquiry-actions'
import { cn } from '@/lib/utils'

/** The strings a Center inquiry dialog shows; the caller resolves them for its locale. */
export type CenterInquiryCopy = {
  cta: string
  title: string
  body: string
  name: string
  phone: string
  submit: string
  success: string
  error: string
}

export function CenterPlanInquiryDialog({
  copy,
  locale,
  className,
}: {
  copy: CenterInquiryCopy
  locale: string
  className?: string
}) {
  const isHe = locale === 'he'
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<CenterInquiryResult | null>(null)

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setResult(null) }}>
      <DialogTrigger asChild>
        <Button type="button" data-cta="pricing-center-enquiry" className={cn('h-11 w-full font-semibold', className)}>{copy.cta}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" dir={isHe ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {result && 'ok' in result ? <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{copy.success}</p> : (
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            setResult(null)
            startTransition(async () => setResult(await submitPublicCenterPlanInquiry({ contactName: String(form.get('name') ?? ''), phone: String(form.get('phone') ?? '') })))
          }}>
            <label className="block text-sm font-medium">{copy.name}<input required name="name" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" /></label>
            <label className="block text-sm font-medium">{copy.phone}<input required name="phone" type="tel" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" /></label>
            {result && !('ok' in result) ? <p className="text-sm text-destructive">{copy.error}</p> : null}
            <Button className="w-full" disabled={pending} type="submit" data-cta="center-enquiry-submit">{copy.submit}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
