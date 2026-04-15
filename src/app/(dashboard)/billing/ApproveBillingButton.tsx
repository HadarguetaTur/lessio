'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { approveBillingAction } from './actions'

interface Props {
  billingId: string
}

export function ApproveBillingButton({ billingId }: Props) {
  const t = useTranslations('billing')
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await approveBillingAction(billingId)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
    >
      {isPending ? t('approving') : t('approve')}
    </button>
  )
}
