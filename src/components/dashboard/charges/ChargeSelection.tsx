'use client'

/**
 * Row selection for the charges table.
 *
 * The table is a server component, so the checkboxes cannot share React state
 * with it directly. A context provider wraps the rendered rows and each cell
 * subscribes to it — the same shape the templates page uses for its test phone
 * (src/components/dashboard/settings/TestPhone.tsx).
 *
 * The rules live in src/lib/charges/selection.ts; this file is the wiring.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CheckCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  retainOnly,
  selectAllState,
  summarize,
  toggleAllOf,
  toggleSelection,
  type ChargeSelection as Selection,
  type SelectedCharge,
} from '@/lib/charges/selection'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import {
  BulkMarkPaidDialog,
  type SettleChargesActionResult,
  type SettleChargesInput,
} from './BulkMarkPaidDialog'

type SelectionContext = {
  selection: Selection
  toggle: (charge: SelectedCharge) => void
  toggleAll: (rows: SelectedCharge[]) => void
  clear: () => void
}

const Ctx = createContext<SelectionContext>({
  selection: new Map(),
  toggle: () => {},
  toggleAll: () => {},
  clear: () => {},
})

function useChargeSelection(): SelectionContext {
  return useContext(Ctx)
}

export function ChargeSelectionProvider({
  /** Every open row currently rendered — a filter change must drop the rest. */
  selectableIds,
  children,
}: {
  selectableIds: string[]
  children: ReactNode
}) {
  const [selection, setSelection] = useState<Selection>(new Map())

  // A row the current filter no longer shows must not be settled by a button
  // that says "3 selected". Keyed on the id list so it only runs when the
  // server sends a different set of rows.
  const idsKey = selectableIds.join(',')
  const previousKey = useRef(idsKey)
  useEffect(() => {
    if (previousKey.current === idsKey) return
    previousKey.current = idsKey
    setSelection((current) => (current.size === 0 ? current : retainOnly(current, idsKey.split(','))))
  }, [idsKey])

  const toggle = useCallback((charge: SelectedCharge) => {
    setSelection((current) => toggleSelection(current, charge))
  }, [])
  const toggleAll = useCallback((rows: SelectedCharge[]) => {
    setSelection((current) => toggleAllOf(current, rows))
  }, [])
  const clear = useCallback(() => setSelection(new Map()), [])

  const value = useMemo(
    () => ({ selection, toggle, toggleAll, clear }),
    [selection, toggle, toggleAll, clear]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function ChargeSelectCheckbox({ charge }: { charge: SelectedCharge }) {
  const t = useTranslations('charges.selection')
  const { selection, toggle } = useChargeSelection()
  const locale = useLocale()

  return (
    <input
      type="checkbox"
      checked={selection.has(charge.chargeId)}
      onChange={() => toggle(charge)}
      aria-label={t('selectRow', {
        name: charge.parentName,
        amount: formatMoney(charge.remaining, locale),
      })}
      className="h-4 w-4 rounded border-input accent-primary"
    />
  )
}

export function SelectAllCheckbox({ rows }: { rows: SelectedCharge[] }) {
  const t = useTranslations('charges.selection')
  const { selection, toggleAll } = useChargeSelection()
  const ref = useRef<HTMLInputElement>(null)
  const state = selectAllState(selection, rows)

  // "Some selected" has no HTML attribute — it is a DOM property only.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      onChange={() => toggleAll(rows)}
      disabled={rows.length === 0}
      aria-label={t('selectAll')}
      className="h-4 w-4 rounded border-input accent-primary disabled:opacity-30"
    />
  )
}

/**
 * The action bar for the current selection. Sits below the table and appears
 * only once something is ticked, so the table is unchanged until it is needed.
 */
export function BulkMarkPaidBar({
  action,
}: {
  action: (input: SettleChargesInput) => Promise<SettleChargesActionResult>
}) {
  const t = useTranslations('charges.selection')
  const tBulk = useTranslations('charges.bulkPaid')
  const { selection, clear } = useChargeSelection()
  const locale = useLocale()
  const [open, setOpen] = useState(false)

  if (selection.size === 0) return null

  const summary = summarize(selection)

  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-card px-5 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <p className="text-sm font-medium text-foreground">
        {t('summary', { count: summary.count, total: formatMoney(summary.total, locale) })}
      </p>
      {summary.parents.length > 1 && (
        <span className="text-xs text-muted-foreground">
          {t('parents', { count: summary.parents.length })}
        </span>
      )}

      <div className="ms-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={clear}>
          <X size={14} />
          {t('clear')}
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <CheckCheck size={14} />
          {tBulk('action')}
        </Button>
      </div>

      <BulkMarkPaidDialog
        selection={selection}
        action={action}
        open={open}
        onOpenChange={setOpen}
        onDone={clear}
      />
    </div>
  )
}
