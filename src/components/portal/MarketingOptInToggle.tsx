'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

/**
 * The parent's own switch for marketing messages.
 *
 * Meta asks for opt-in per message category, and this is the honest half of
 * that: the business can attest that a parent agreed, but only the parent can
 * actually say so. Turning it off never touches lesson reminders, homework or
 * payment requests — the copy says which is which, because a parent who loses
 * their reminders after tapping this would rightly blame the tap.
 */
export function MarketingOptInToggle({
  initial,
  orgName,
  action,
}: {
  initial: boolean
  orgName: string
  action: (optIn: boolean) => Promise<{ error: string | null }>
}) {
  const t = useTranslations('portal.marketingOptIn')
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  const toggle = () => {
    const next = !on
    setOn(next)
    setFailed(false)
    startTransition(async () => {
      const result = await action(next)
      if (result.error) {
        setOn(!next)
        setFailed(true)
      }
    })
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{t('title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('description', { org: orgName })}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t('title')}
          onClick={toggle}
          disabled={pending}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            on ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              on ? 'start-[1.375rem]' : 'start-0.5'
            }`}
          />
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{t('serviceNote')}</p>

      {pending && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          {t('saving')}
        </p>
      )}
      {failed && <p className="mt-2 text-xs text-destructive">{t('failed')}</p>}
    </section>
  )
}
