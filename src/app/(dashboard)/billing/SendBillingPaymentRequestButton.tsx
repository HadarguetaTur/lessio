'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { sendBillingPaymentRequestAction } from './actions'

interface Props {
  billingId: string
}

export function SendBillingPaymentRequestButton({ billingId }: Props) {
  const t = useTranslations('billing')
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await sendBillingPaymentRequestAction(billingId)
      if (!result.error) {
        setSent(true)
      } else {
        setError(result.error)
      }
    })
  }

  if (sent) {
    return (
      <span className="px-3 py-1.5 text-xs font-medium text-emerald-700">
        {t('paymentRequestSent')}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
      >
        {isPending ? t('sendingPaymentRequest') : t('sendPaymentRequest')}
      </button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  )
}
