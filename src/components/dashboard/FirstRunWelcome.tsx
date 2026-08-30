'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, ClipboardCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FirstRunWelcome({
  initialSeen,
  markSeen,
}: {
  initialSeen: boolean
  markSeen: () => Promise<void>
}) {
  const t = useTranslations('dashboard.firstRun')
  const [open, setOpen] = useState(!initialSeen)
  const [, startTransition] = useTransition()

  const close = () => {
    setOpen(false)
    startTransition(() => markSeen())
  }

  if (!open) return null

  const items = [
    { key: 'people', icon: Users },
    { key: 'calendar', icon: CalendarDays },
    { key: 'attention', icon: ClipboardCheck },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h2 id="first-run-title" className="text-2xl font-bold text-foreground">{t('title')}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('description')}</p>
        <div className="mt-6 grid gap-3">
          {items.map(({ key: item, icon: Icon }) => (
            <div key={item} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><Icon size={17} /></span>
              <div><p className="text-sm font-semibold text-foreground">{t(`items.${item}.title`)}</p><p className="mt-0.5 text-xs text-muted-foreground">{t(`items.${item}.description`)}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button onClick={close} className="flex-1">{t('start')}</Button>
          <Button onClick={close} variant="ghost" className="flex-1">{t('skip')}</Button>
        </div>
      </div>
    </div>
  )
}
