'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { sendBillingPaymentRequestAction } from './actions'

interface Props {
  billingId: string
}

export function SendBillingPaymentRequestButton({ billingId }: Props) {
  const t = useTranslations('billing')
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [noProvider, setNoProvider] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    setNoProvider(false)
    startTransition(async () => {
      const result = await sendBillingPaymentRequestAction(billingId)
      if (result.error) {
        setError(result.error)
        return
      }
      // Only a real send earns the tick. 'no_provider' means the org has
      // nothing to send with — saying "sent ✓" there is how an owner finds out
      // from the parent that no message ever arrived.
      if (result.outcome === 'sent') setSent(true)
      else if (result.outcome === 'no_provider') setNoProvider(true)
    })
  }

  if (sent) {
    return (
      <span className="px-3 py-1.5 text-xs font-medium text-emerald-700">
        {t('paymentRequestSent')}
      </span>
    )
  }

  if (noProvider) {
    return (
      <span className="flex flex-col items-start gap-0.5 px-3 py-1.5 text-xs text-amber-700">
        {t('paymentRequestNoProvider')}
        <Link href="/settings/payment" className="font-medium underline underline-offset-2">
          {t('paymentRequestNoProviderLink')}
        </Link>
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
