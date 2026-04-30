'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { generateMonthlyBilling } from './actions'

interface Props {
  billingMonth: string
}

export function GenerateBillingButton({ billingMonth }: Props) {
  const t = useTranslations('billing')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  function handleClick() {
    startTransition(async () => {
      const res = await generateMonthlyBilling(billingMonth)
      if (res.error) {
        setResult(res.error)
      } else {
        setResult(
          t('generateSuccess', {
            success: res.success ?? 0,
            errors: res.errors ?? 0,
            skipped: res.skipped ?? 0,
          })
        )
      }
    })
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
      {result && (
        <span className="text-center text-xs text-muted-foreground sm:max-w-xs sm:truncate sm:text-start">
          {result}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={isPending}
        className="w-full px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 sm:w-auto"
      >
        {isPending ? t('generating') : t('generateBilling')}
      </button>
    </div>
  )
}
