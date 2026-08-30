'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { setManualAdjustment } from '../actions'

interface Props {
  billingId: string
  currentAmount: number | null
  currentReason: string | null
}

export function ManualAdjustmentForm({
  billingId,
  currentAmount,
  currentReason,
}: Props) {
  const t = useTranslations('billing.detail')
  const locale = useLocale()
  const money = (amount: number) => formatMoney(amount, locale)
  const tCommon = useTranslations('common')
  const [isPending, startTransition] = useTransition()
  const [amount, setAmount] = useState(currentAmount?.toString() ?? '')
  const [reason, setReason] = useState(currentReason ?? '')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount)) {
      setError(t('invalidAmount'))
      return
    }
    if (!reason.trim()) {
      setError(t('reasonRequired'))
      return
    }

    startTransition(async () => {
      const res = await setManualAdjustment(billingId, numAmount, reason.trim())
      if (res.error) setError(res.error)
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card rounded-xl border border-border p-4 flex flex-wrap items-end gap-3"
    >
      <div>
        <label htmlFor="adjustment_amount" className="text-xs font-semibold text-muted-foreground uppercase block mb-1">
          {t('adjustmentAmount')} (₪)
        </label>
        <input
          id="adjustment_amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground w-32 focus:outline-none focus:ring-2 focus:ring-ring"
          dir="ltr"
        />
      </div>
      <div className="flex-1 min-w-[200px]">
        <label htmlFor="adjustment_reason" className="text-xs font-semibold text-muted-foreground uppercase block mb-1">
          {t('adjustmentReason')}
        </label>
        <input
          id="adjustment_reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground w-full focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {t('saveAdjustment')}
      </button>
      {error && <p className="text-xs text-destructive w-full">{error}</p>}
      {currentAmount != null && (
        <p className="text-xs text-muted-foreground w-full">
          {tCommon('table.amount')}: {money(currentAmount)} — {currentReason}
        </p>
      )}
    </form>
  )
}
