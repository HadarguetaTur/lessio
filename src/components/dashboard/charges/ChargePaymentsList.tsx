'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { ChargePayment } from '@/lib/charges/paymentMethods'

interface ChargePaymentsListProps {
  payments: ChargePayment[]
  total: number
  paid: number
}

export function ChargePaymentsList({ payments, total, paid }: ChargePaymentsListProps) {
  const t = useTranslations('charges')
  const format = useFormatter()
  const locale = useLocale()
  const money = (amount: number) => formatMoney(amount, locale)
  const remaining = Math.max(0, total - paid)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('payments.summary', { paid: money(paid), total: money(total) })}
        {remaining > 0 && ` · ${t('payments.remaining', { amount: money(remaining) })}`}
      </p>

      <ul className="divide-y divide-border">
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                {t(`recordPayment.methods.${payment.method}` as Parameters<typeof t>[0])}
              </p>
              <p className="text-xs text-muted-foreground">
                {format.dateTime(new Date(payment.paidAt), {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
                {' · '}
                {payment.recordedBy ?? t('audit.systemActor')}
              </p>
              {payment.notes && (
                <p className="mt-0.5 text-xs text-foreground/80">{payment.notes}</p>
              )}
            </div>
            <span className="font-mono text-sm font-medium text-emerald-700" dir="ltr">
              {money(payment.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
