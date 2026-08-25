'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { MessageSquare } from 'lucide-react'

interface Props {
  parentId: string
  action: (parentId: string) => Promise<{ error: string | null }>
}

export function SendPaymentRequestButton({ parentId, action }: Props) {
  const t = useTranslations('parents')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error: string | null } | null>(null)

  function handleClick() {
    setResult(null)
    startTransition(async () => {
      const r = await action(parentId)
      setResult(r)
    })
  }

  if (result?.error === null) {
    return <span className="text-xs text-green-700">{t('paymentSentMark')}</span>
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <MessageSquare size={13} />
        {isPending ? t('paymentSending') : t('sendPaymentRequest')}
      </button>
      {result?.error && (
        <p className="mt-1 text-xs text-red-600">{result.error}</p>
      )}
    </div>
  )
}
