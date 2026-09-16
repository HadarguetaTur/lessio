'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { PackProduct, CoveredLessonType } from '@/lib/billing/packs/products'

type ActionState = { error: string } | { success: true } | null

interface Props {
  products: PackProduct[]
  readOnly: boolean
  saveAction: (productId: string | null, prev: ActionState, formData: FormData) => Promise<ActionState>
  setActiveAction: (productId: string, active: boolean) => Promise<ActionState>
}

const TYPES: CoveredLessonType[] = ['individual', 'pair', 'group', 'custom']
const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

/** The punch cards an org can sell (decision #46). Edits never touch cards already sold. */
export function PackCatalogManager({ products, readOnly, saveAction, setActiveAction }: Props) {
  const t = useTranslations('settings.packs')
  const locale = useLocale()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [toggling, startToggle] = useTransition()

  return (
    <section className="max-w-lg space-y-3" aria-labelledby="pack-catalog">
      <div>
        <h2 id="pack-catalog" className="text-base font-semibold text-gray-900">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {toggleError && <p role="alert" className="text-sm text-red-700">{toggleError}</p>}

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {products.length === 0 && editing !== 'new' && (
          <p className="p-4 text-sm text-muted-foreground">{t('empty')}</p>
        )}
        {products.map((product) =>
          editing === product.id ? (
            <ProductForm
              key={product.id}
              product={product}
              saveAction={saveAction}
              onDone={() => setEditing(null)}
            />
          ) : (
            <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {product.name}
                  {!product.is_active && (
                    <span className="ms-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{t('archived')}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('summary', { credits: product.credits, price: formatMoney(product.price, locale) })}
                  {' · '}
                  {product.validity_days ? t('validity', { days: product.validity_days }) : t('noValidity')}
                  {' · '}
                  {product.covered_lesson_types.map((type) => t(`lessonTypes.${type}`)).join(', ')}
                </p>
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(product.id)}>
                    {t('edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={toggling}
                    onClick={() =>
                      startToggle(async () => {
                        const result = await setActiveAction(product.id, !product.is_active)
                        setToggleError(result && 'error' in result ? result.error : null)
                      })
                    }
                  >
                    {product.is_active ? t('archive') : t('restore')}
                  </Button>
                </div>
              )}
            </div>
          )
        )}
        {editing === 'new' && <ProductForm product={null} saveAction={saveAction} onDone={() => setEditing(null)} />}
      </div>

      {!readOnly && editing === null && (
        <Button type="button" variant="outline" onClick={() => setEditing('new')}>
          + {t('add')}
        </Button>
      )}
    </section>
  )
}

function ProductForm({
  product,
  saveAction,
  onDone,
}: {
  product: PackProduct | null
  saveAction: Props['saveAction']
  onDone: () => void
}) {
  const t = useTranslations('settings.packs')
  const [state, formAction, pending] = useActionState(saveAction.bind(null, product?.id ?? null), null)

  useEffect(() => {
    if (state && 'success' in state) onDone()
  }, [state, onDone])

  const idPrefix = product?.id ?? 'new'
  return (
    <form action={formAction} className="space-y-3 p-4" noValidate>
      {state && 'error' in state && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-2 rounded-md">{state.error}</p>
      )}
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-name`} className="block text-sm font-medium text-gray-700">{t('fields.name')}</label>
        <input id={`${idPrefix}-name`} name="name" defaultValue={product?.name ?? ''} maxLength={80} className={INPUT} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-credits`} className="block text-sm font-medium text-gray-700">{t('fields.credits')}</label>
          <input id={`${idPrefix}-credits`} name="credits" type="number" min="1" step="1" defaultValue={product?.credits ?? 10} className={INPUT} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-price`} className="block text-sm font-medium text-gray-700">{t('fields.price')}</label>
          <input id={`${idPrefix}-price`} name="price" type="number" min="0" step="0.01" defaultValue={product?.price ?? ''} className={INPUT} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-validity`} className="block text-sm font-medium text-gray-700">{t('fields.validityDays')}</label>
          <input id={`${idPrefix}-validity`} name="validity_days" type="number" min="1" step="1" defaultValue={product?.validity_days ?? ''} placeholder={t('fields.validityHint')} className={INPUT} />
        </div>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-gray-700">{t('fields.coveredTypes')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {TYPES.map((type) => (
            <label key={type} className="flex min-h-9 items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="covered_lesson_types"
                value={type}
                defaultChecked={product ? product.covered_lesson_types.includes(type) : true}
                className="size-4 accent-blue-600"
              />
              {t(`lessonTypes.${type}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? t('saving') : t('save')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>{t('cancel')}</Button>
      </div>
    </form>
  )
}
