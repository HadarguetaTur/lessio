'use client'

/**
 * The three fields every "money came in" dialog asks for: how it was paid, an
 * optional note, and whether to tell the parent.
 *
 * Shared by the single-charge, whole-balance and multi-charge dialogs so the
 * wording and the defaults cannot drift between them.
 */

import { useTranslations } from 'next-intl'
import { Textarea } from '@/components/ui/textarea'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/charges/paymentMethods'

interface PaymentDetailsFieldsProps {
  method: PaymentMethod
  onMethodChange: (method: PaymentMethod) => void
  notes: string
  onNotesChange: (notes: string) => void
  notifyParent: boolean
  onNotifyChange: (notify: boolean) => void
  /** False when nobody in scope has a phone — there is nothing to offer. */
  showNotify: boolean
  /** Keeps the label/field ids unique when two dialogs are mounted at once. */
  idPrefix: string
  /** Overrides the confirmation label, e.g. the plural form for several parents. */
  notifyLabel?: string
}

export function PaymentDetailsFields({
  method,
  onMethodChange,
  notes,
  onNotesChange,
  notifyParent,
  onNotifyChange,
  showNotify,
  idPrefix,
  notifyLabel,
}: PaymentDetailsFieldsProps) {
  const t = useTranslations('charges.recordPayment')

  return (
    <>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${idPrefix}-method`}>
          {t('methodLabel')}
        </label>
        <select
          id={`${idPrefix}-method`}
          value={method}
          onChange={(e) => onMethodChange(e.target.value as PaymentMethod)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
      </div>

      <Textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder={t('notesPlaceholder')}
        rows={2}
        maxLength={500}
      />

      {showNotify && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={notifyParent}
            onChange={(e) => onNotifyChange(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          {notifyLabel ?? t('notifyParent')}
        </label>
      )}
    </>
  )
}
