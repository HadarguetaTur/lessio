'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { FileText, CreditCard, MinusCircle } from 'lucide-react'
import type { ReceiptMode } from '@/lib/receipts'

/**
 * Asks the owner who issues their invoices, before offering any credentials
 * form. Replaces a provider dropdown that arrived with a service pre-selected —
 * which read as "pick one" to a teacher whose payment provider was already
 * issuing invoices, and produced two documents for the same payment.
 *
 * The payment-provider option is hidden when no payment provider is connected:
 * it would be an answer the org cannot truthfully give.
 */
export function ReceiptModeChooser({
  paymentProviderLabel,
  onChoose,
}: {
  paymentProviderLabel: string | null
  onChoose: (mode: ReceiptMode) => Promise<{ error?: string }>
}) {
  const t = useTranslations('settings.receiptMode')
  const [selected, setSelected] = useState<ReceiptMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const options: {
    mode: ReceiptMode
    icon: typeof FileText
    title: string
    description: string
  }[] = [
    {
      mode: 'external',
      icon: FileText,
      title: t('external.title'),
      description: t('external.description'),
    },
    ...(paymentProviderLabel
      ? [
          {
            mode: 'payment_provider' as const,
            icon: CreditCard,
            title: t('paymentProvider.title', { provider: paymentProviderLabel }),
            description: t('paymentProvider.description', { provider: paymentProviderLabel }),
          },
        ]
      : []),
    {
      mode: 'none',
      icon: MinusCircle,
      title: t('none.title'),
      description: t('none.description'),
    },
  ]

  function submit() {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const result = await onChoose(selected)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{t('question')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('intro')}</p>
      </div>

      {/* The question has no default answer, so until it is answered the org is
          silently in the "nothing is issued" state. Saying so beats leaving the
          owner to infer it from an unselected radio group. */}
      <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        {t('currentlyNone')}
      </p>

      <div className="space-y-2">
        {options.map(({ mode, icon: Icon, title, description }) => (
          <label
            key={mode}
            className={`flex gap-3 items-start p-4 rounded-lg border cursor-pointer transition-colors ${
              selected === mode
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="receipt-mode"
              value={mode}
              checked={selected === mode}
              onChange={() => setSelected(mode)}
              className="mt-1 shrink-0"
            />
            <Icon size={18} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">{title}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!selected || isPending}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {t('continue')}
      </button>
    </div>
  )
}
