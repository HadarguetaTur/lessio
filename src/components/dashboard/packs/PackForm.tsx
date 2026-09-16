'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { PackProduct } from '@/lib/billing/packs/products'
import type { PackActionResult } from '@/app/(dashboard)/packs/actions'

interface Props {
  studentId: string
  studentName: string
  products: PackProduct[]
  packScope: 'student' | 'family'
  packActivation: 'immediate' | 'on_payment'
  billingMode: 'monthly' | 'per_lesson'
  isOwner: boolean
  sellAction: (input: {
    studentId: string
    productId: string
    scope?: 'student' | 'family'
    priceOverride?: number | null
    notes?: string | null
  }) => Promise<PackActionResult>
  onDone: () => void
  onCancel: () => void
}

const INPUT =
  'w-full px-3 py-2 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring'

/** Selling a card from the catalog (decision #46). The product is snapshotted on sale. */
export function PackForm({
  studentId,
  studentName,
  products,
  packScope,
  packActivation,
  billingMode,
  isOwner,
  sellAction,
  onDone,
  onCancel,
}: Props) {
  const t = useTranslations('packs.sell')
  const locale = useLocale()
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [scope, setScope] = useState<'student' | 'family'>(packScope)
  const product = products.find((p) => p.id === productId)
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (products.length === 0) {
    return (
      <div className="px-4 py-4 text-sm text-muted-foreground space-y-2">
        <p>{t('noProducts')}</p>
        <Link href="/settings/cancellation-policy" className="text-primary hover:underline">{t('setupCatalog')}</Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const override = isOwner && product && price !== '' && Number(price) !== product.price ? Number(price) : null
    if (override != null && (!Number.isFinite(override) || override < 0)) {
      setError(t('invalidPrice'))
      return
    }
    setSaving(true)
    try {
      const result = await sellAction({ studentId, productId, scope, priceOverride: override, notes: notes || null })
      if (result.error) setError(result.error)
      else onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3" noValidate>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-1">
        <label htmlFor="pack-product" className="text-sm font-medium">{t('product')}</label>
        <select
          id="pack-product"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value)
            const next = products.find((p) => p.id === e.target.value)
            setPrice(next ? String(next.price) : '')
          }}
          className={INPUT}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {t('productOption', { name: p.name, credits: p.credits, price: formatMoney(p.price, locale) })}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t('scope')}</legend>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="radio" name="scope" checked={scope === 'student'} onChange={() => setScope('student')} className="accent-primary" />
          {t('scopeStudent', { name: studentName })}
        </label>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="radio" name="scope" checked={scope === 'family'} onChange={() => setScope('family')} className="accent-primary" />
          {t('scopeFamily')}
        </label>
      </fieldset>

      {isOwner && (
        <div className="space-y-1">
          <label htmlFor="pack-price" className="text-sm font-medium">{t('priceOverride')}</label>
          <input id="pack-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={INPUT} />
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="pack-notes" className="text-sm font-medium">{t('notes')}</label>
        <input id="pack-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className={INPUT} />
      </div>

      <p className="text-xs text-muted-foreground">
        {billingMode === 'monthly'
          ? t('monthlyNote', { name: studentName })
          : packActivation === 'on_payment'
            ? `${t('perLessonNote')} ${t('onPaymentNote')}`
            : t('perLessonNote')}
      </p>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !productId}>{saving ? t('submitting') : t('submit')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>{t('cancel')}</Button>
      </div>
    </form>
  )
}
