'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createSubscriptionAction, updateSubscriptionAction, deleteSubscriptionAction } from '@/app/(dashboard)/billing/actions'
import type { Subscription } from '@/lib/subscriptions'
import { Button } from '@/components/ui/button'

interface Props {
  studentId: string
  subscription?: Subscription
  onSuccess: () => void
  onCancel: () => void
}

export function SubscriptionForm({ studentId, subscription, onSuccess, onCancel }: Props) {
  const t = useTranslations('subscriptions')
  const tCommon = useTranslations('common')

  const [type, setType] = useState(subscription?.subscription_type ?? '')
  const [monthlyAmount, setMonthlyAmount] = useState(
    subscription ? String(subscription.monthly_amount) : ''
  )
  const [startDate, setStartDate] = useState(subscription?.start_date ?? '')
  const [endDate, setEndDate] = useState(subscription?.end_date ?? '')
  const [isPaused, setIsPaused] = useState(subscription?.is_paused ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amount = parseFloat(monthlyAmount)
    if (isNaN(amount) || amount <= 0) {
      setError(tCommon('errors.required'))
      return
    }
    if (!startDate) {
      setError(tCommon('errors.required'))
      return
    }

    setSaving(true)
    try {
      let result: { error: string | null }
      if (subscription) {
        result = await updateSubscriptionAction(subscription.id, {
          subscription_type: type || null,
          monthly_amount: amount,
          start_date: startDate,
          end_date: endDate || null,
          is_paused: isPaused,
        })
      } else {
        result = await createSubscriptionAction({
          student_id: studentId,
          subscription_type: type || null,
          monthly_amount: amount,
          start_date: startDate,
          end_date: endDate || null,
        })
      }

      if (result.error) {
        setError(result.error)
      } else {
        onSuccess()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!subscription) return
    setSaving(true)
    try {
      const result = await deleteSubscriptionAction(subscription.id)
      if (result.error) {
        setError(result.error)
      } else {
        onSuccess()
      }
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-muted/30 rounded-xl border border-border">
      <p className="text-sm font-semibold text-foreground">
        {subscription ? t('editSubscription') : t('addSubscription')}
      </p>

      <div>
        <label className={labelClass}>{t('fields.type')} {tCommon('optional')}</label>
        <input
          type="text"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={inputClass}
          placeholder={t('fields.type')}
          disabled={saving}
        />
      </div>

      <div>
        <label className={labelClass}>{t('fields.monthlyAmount')}</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={monthlyAmount}
          onChange={(e) => setMonthlyAmount(e.target.value)}
          className={inputClass}
          required
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t('fields.startDate')}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
            required
            disabled={saving}
          />
        </div>
        <div>
          <label className={labelClass}>{t('fields.endDate')} {tCommon('optional')}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
            disabled={saving}
          />
        </div>
      </div>

      {subscription && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is-paused"
            checked={isPaused}
            onChange={(e) => setIsPaused(e.target.checked)}
            disabled={saving}
            className="w-4 h-4 accent-primary"
          />
          <label htmlFor="is-paused" className="text-sm text-foreground">
            {subscription.is_paused ? t('resume') : t('pause')}
          </label>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2 justify-between pt-1">
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? tCommon('actions.saving') : tCommon('actions.save')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            {tCommon('actions.cancel')}
          </Button>
        </div>
        {subscription && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            {tCommon('actions.delete')}
          </Button>
        )}
      </div>
    </form>
  )
}
