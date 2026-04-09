'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { markBillingAsPaid } from './actions'

interface Props {
  billingId: string
}

export function MarkPaidButton({ billingId }: Props) {
  const t = useTranslations('billing.detail')
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await markBillingAsPaid(billingId)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-50"
    >
      {t('markAsPaid')}
    </button>
  )
}
