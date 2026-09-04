'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { markBillingAsPaid } from './actions'

interface Props {
  billingId: string
}

export function MarkPaidButton({ billingId }: Props) {
  const t = useTranslations('billing.detail')
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      // The action refuses an unapproved record; without this the click was a
      // no-op the owner could not distinguish from success (UX audit 8, F-H1).
      const result = await markBillingAsPaid(billingId)
      if (result?.error) toast.error(result.error)
      else toast.success(t('markedPaid'))
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
