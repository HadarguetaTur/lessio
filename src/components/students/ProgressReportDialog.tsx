'use client'

import { useState, useTransition, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { FileBarChart, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AppLocale } from '@/lib/i18n/locale'
import type {
  ProgressReportActionResult,
  SendProgressReportResult,
} from '@/app/(dashboard)/students/[id]/actions'

export type ParentEmailOption = {
  email: string
  label: string
}

type Props = {
  studentId: string
  studentName: string
  defaultFrom: string
  defaultTo: string
  parentRecipients: ParentEmailOption[]
  appLocale: AppLocale
  generateReportAction: (
    studentId: string,
    fromDate: string,
    toDate: string
  ) => Promise<ProgressReportActionResult>
  sendReportEmailAction: (
    studentId: string,
    fromDate: string,
    toDate: string,
    recipientEmail: string,
    locale: string
  ) => Promise<SendProgressReportResult>
}

export function ProgressReportDialog({
  studentId,
  studentName,
  defaultFrom,
  defaultTo,
  parentRecipients,
  appLocale,
  generateReportAction,
  sendReportEmailAction,
}: Props) {
  const t = useTranslations('studentProfile.progressReport')
  const locale = useLocale()
  const contentDir = locale === 'he' ? 'rtl' : 'ltr'
  const [open, setOpen] = useState(false)
  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(defaultTo)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [emailMode, setEmailMode] = useState<'parent' | 'custom'>(
    parentRecipients.length > 0 ? 'parent' : 'custom'
  )
  const [selectedParentEmail, setSelectedParentEmail] = useState(
    parentRecipients[0]?.email ?? ''
  )
  const [customEmail, setCustomEmail] = useState('')

  useEffect(() => {
    if (open) {
      setFromDate(defaultFrom)
      setToDate(defaultTo)
      setError(null)
      setSuccessMsg(null)
    }
  }, [open, defaultFrom, defaultTo])

  const recipient =
    emailMode === 'custom' ? customEmail.trim() : selectedParentEmail.trim()

  const onDownload = () => {
    setError(null)
    setSuccessMsg(null)
    startTransition(async () => {
      const r = await generateReportAction(studentId, fromDate, toDate)
      if (r.error) {
        setError(r.error)
        return
      }
      if (r.signedUrl) {
        window.open(r.signedUrl, '_blank', 'noopener,noreferrer')
      }
    })
  }

  const onSendEmail = () => {
    setError(null)
    setSuccessMsg(null)
    startTransition(async () => {
      const r = await sendReportEmailAction(
        studentId,
        fromDate,
        toDate,
        recipient,
        appLocale
      )
      if (r.error) {
        setError(r.error)
        return
      }
      setSuccessMsg(t('sent'))
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <FileBarChart size={15} />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" dir={contentDir}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {t('studentName')}: <strong>{studentName}</strong>
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('from')}
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('to')}
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">{t('includesTitle')}</p>
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
              <li>{t('includes.attendance')}</li>
              <li>{t('includes.homework')}</li>
              <li>{t('includes.exams')}</li>
              <li>{t('includes.goals')}</li>
              <li>{t('includes.notes')}</li>
            </ul>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

          <div className="flex flex-col gap-2">
            <Button type="button" onClick={onDownload} disabled={pending} className="w-full gap-2">
              {pending ? <Loader2 className="animate-spin size-4" /> : null}
              {t('download')}
            </Button>

            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('sendSection')}</p>
              {parentRecipients.length > 0 && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="emailMode"
                      checked={emailMode === 'parent'}
                      onChange={() => setEmailMode('parent')}
                    />
                    {t('toParent')}
                  </label>
                  {emailMode === 'parent' && (
                    <select
                      value={selectedParentEmail}
                      onChange={(e) => setSelectedParentEmail(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      {parentRecipients.map((p) => (
                        <option key={p.email} value={p.email}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="emailMode"
                      checked={emailMode === 'custom'}
                      onChange={() => setEmailMode('custom')}
                    />
                    {t('customEmail')}
                  </label>
                </div>
              )}
              {(emailMode === 'custom' || parentRecipients.length === 0) && (
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={onSendEmail}
                disabled={pending || !recipient}
                className="w-full"
              >
                {t('send')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
