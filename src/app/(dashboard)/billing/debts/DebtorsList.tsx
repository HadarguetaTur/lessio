'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CheckCheck, ChevronDown, Copy, CreditCard, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchField } from '@/components/ui/search-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  RecordPaymentDialog,
  type ManualPaymentResult,
  type RecordPaymentInput,
} from '@/components/dashboard/charges/RecordPaymentDialog'
import { ResolveChargeDialog } from '@/components/dashboard/charges/ResolveChargeDialog'
import {
  SettleBalanceDialog,
  type SettleBalanceInput,
  type SettleBalanceResult,
} from '@/components/dashboard/charges/SettleBalanceDialog'
import {
  BulkMarkPaidDialog,
  type SettleChargesActionResult,
  type SettleChargesInput,
} from '@/components/dashboard/charges/BulkMarkPaidDialog'
import {
  summarize,
  toggleAllOf,
  toggleSelection,
  type SelectedCharge,
} from '@/lib/charges/selection'
import { renderChargeNote } from '@/lib/charges/renderNote'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { matchesSearch } from '@/lib/search/text'
import type { DebtorRow } from '@/lib/charges/debtors'
import type { SendRemindersResult } from './actions'

interface DebtorsListProps {
  rows: DebtorRow[]
  locale: string
  isOwner: boolean
  /** Org default for the confirmation checkbox, set at /settings/whatsapp. */
  defaultNotifyParent: boolean
  sendRemindersAction: (parentIds: string[]) => Promise<SendRemindersResult>
  sendPaymentRequestsAction: (parentIds: string[]) => Promise<SendRemindersResult>
  recordPaymentAction: (input: RecordPaymentInput) => Promise<ManualPaymentResult>
  settleAction: (input: SettleBalanceInput) => Promise<SettleBalanceResult>
  settleChargesAction: (input: SettleChargesInput) => Promise<SettleChargesActionResult>
  waiveAction: (chargeId: string, reason: string) => Promise<{ error: string | null }>
  voidAction: (chargeId: string, reason: string) => Promise<{ error: string | null }>
}

/** A debtor is found by their own name, any child's name, or their phone. */
function matchesRow(row: DebtorRow, term: string): boolean {
  return matchesSearch(term, { names: [row.parentName, ...row.childrenNames], phones: [row.phone] })
}

/** One expanded charge, in the shape the shared selection helpers expect. */
function chargeRowOf(row: DebtorRow, charge: DebtorRow['charges'][number]): SelectedCharge {
  return {
    chargeId: charge.id,
    parentId: row.parentId,
    parentName: row.parentName,
    parentHasPhone: Boolean(row.phone),
    remaining: charge.remaining,
  }
}

export function DebtorsList({
  rows,
  locale,
  isOwner,
  defaultNotifyParent,
  sendRemindersAction,
  sendPaymentRequestsAction,
  recordPaymentAction,
  settleAction,
  settleChargesAction,
  waiveAction,
  voidAction,
}: DebtorsListProps) {
  const t = useTranslations('debts')
  const tRoot = useTranslations()
  const tCharges = useTranslations('charges')
  const tSelection = useTranslations('charges.selection')
  const tBulk = useTranslations('charges.bulkPaid')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  // Charge selection lives inside the expanded parent, so it cannot be confused
  // with the parent-level selection the bulk messaging buttons use above.
  const [selectedCharges, setSelectedCharges] = useState<Map<string, SelectedCharge>>(new Map())
  const [bulkOpen, setBulkOpen] = useState(false)

  // Filtered in memory: the page already loads every debtor, and a collection
  // list is short enough that a round trip per keystroke buys nothing.
  const visibleRows = useMemo(() => rows.filter((r) => matchesRow(r, query)), [rows, query])

  // An opted-out parent cannot be messaged at all, so it is never selectable.
  const selectableIds = useMemo(
    () => visibleRows.filter((r) => !r.optedOut && r.phone).map((r) => r.parentId),
    [visibleRows]
  )

  const allSelected = selectableIds.length > 0 && selected.size === selectableIds.length

  function search(next: string) {
    setQuery(next)
    // A parent hidden by the filter must not stay silently selected — the bulk
    // buttons say "{count} parents" and the user can only see the visible ones.
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const stillVisible = new Set(rows.filter((r) => matchesRow(r, next)).map((r) => r.parentId))
      return new Set([...prev].filter((id) => stillVisible.has(id)))
    })
  }

  function toggle(parentId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  function send(parentIds: string[], kind: 'reminder' | 'request' = 'reminder') {
    startTransition(async () => {
      const result =
        kind === 'reminder'
          ? await sendRemindersAction(parentIds)
          : await sendPaymentRequestsAction(parentIds)

      if (result.error) {
        toast.error(result.error)
        return
      }

      const skipped = result.optedOut + result.skipped + result.failed
      const key =
        kind === 'reminder'
          ? skipped > 0
            ? 'remindersSentWithSkipped'
            : 'remindersSent'
          : skipped > 0
            ? 'requestsSentWithSkipped'
            : 'requestsSent'

      toast.success(t(key, { sent: result.sent, skipped }))
      setSelected(new Set())
    })
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-3">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          disabled={selectableIds.length === 0}
          aria-label={t('selectAll')}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <span className="text-xs font-medium text-muted-foreground">
          {selected.size > 0 ? t('selectedCount', { count: selected.size }) : t('selectAll')}
        </span>
        <SearchField
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="ms-2 max-w-xs [&>input]:h-9"
        />
        {selected.size > 0 && (
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={isPending}
              onClick={() => send([...selected], 'request')}
            >
              <CreditCard size={14} />
              {t('sendPaymentRequestBulk', { count: selected.size })}
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={isPending}
              onClick={() => send([...selected])}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {t('sendRemindersBulk', { count: selected.size })}
            </Button>
          </div>
        )}
      </div>

      <div className="h-full overflow-auto">
        {visibleRows.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {tRoot('common.emptyStates.noResults')}
          </p>
        )}
        <ul className="divide-y divide-border">
          {visibleRows.map((row) => {
            const isExpanded = expanded === row.parentId
            const canMessage = !row.optedOut && Boolean(row.phone)
            const chargeRows = isExpanded ? row.charges.map((c) => chargeRowOf(row, c)) : []
            const chargeSummary = summarize(selectedCharges)

            return (
              <li key={row.parentId}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <input
                    type="checkbox"
                    checked={selected.has(row.parentId)}
                    onChange={() => toggle(row.parentId)}
                    disabled={!canMessage}
                    aria-label={row.parentName}
                    className="h-4 w-4 rounded border-input accent-primary disabled:opacity-30"
                  />

                  <UserAvatar name={row.parentName} />

                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium text-foreground">{row.parentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.phone ? (
                        <span dir="ltr">{row.phone}</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">{t('noPhone')}</span>
                      )}
                      {row.childrenNames.length > 0 && ` · ${row.childrenNames.join(', ')}`}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="font-mono text-sm font-semibold text-amber-700 dark:text-amber-400" dir="ltr">
                      {formatCurrency(row.totalDebt, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('chargeCount', { count: row.chargeCount })} ·{' '}
                      {t('oldestAge', { days: row.oldestAgeDays })}
                    </p>
                  </div>

                  {row.optedOut && (
                    // The chip used to be the whole story: a greyed-out row and
                    // two dead buttons, with no way to tell why or what to do
                    // instead.
                    <span
                      className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      title={t('optedOutExplain')}
                    >
                      {t('optedOut')}
                    </span>
                  )}

                  <div className="flex items-center gap-1">
                    {row.optedOut ? (
                      // WhatsApp is closed for this parent, so hand over the
                      // message instead of offering a button that cannot work.
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(
                              tRoot('debts.copyMessageBody', {
                                name: row.parentName,
                                amount: formatCurrency(row.totalDebt, locale),
                              })
                            )
                            .then(() => toast.success(t('messageCopied')))
                            .catch(() => toast.error(t('copyFailed')))
                        }}
                      >
                        <Copy size={14} />
                        {t('copyMessage')}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={!canMessage || isPending}
                        onClick={() => send([row.parentId])}
                      >
                        <Send size={14} />
                        {t('sendReminder')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={!canMessage || isPending}
                      onClick={() => send([row.parentId], 'request')}
                    >
                      <CreditCard size={14} />
                      {t('sendPaymentRequest')}
                    </Button>
                    {/* The money came in for everything at once — one
                        confirmation instead of a dialog per charge below. */}
                    <SettleBalanceDialog
                      parentId={row.parentId}
                      parentName={row.parentName}
                      total={row.totalDebt}
                      chargeCount={row.chargeCount}
                      parentHasPhone={Boolean(row.phone)}
                      defaultNotifyParent={defaultNotifyParent}
                      action={settleAction}
                      variant="ghost"
                      triggerLabel={t('settleBalance')}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isExpanded}
                      aria-label={t('toggleCharges')}
                      onClick={() => {
                        // A selection belongs to the parent it was made in.
                        setSelectedCharges(new Map())
                        setExpanded(isExpanded ? null : row.parentId)
                      }}
                    >
                      <ChevronDown
                        size={16}
                        className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'}
                      />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <ul className="divide-y divide-border border-t border-border bg-muted/20">
                    {/* Tick the lessons this parent just paid for — the middle
                        ground between one charge and their whole balance. */}
                    <li className="flex flex-wrap items-center gap-3 bg-muted/40 px-5 py-2 ps-14">
                      <input
                        type="checkbox"
                        checked={chargeRows.length > 0 && selectedCharges.size === chargeRows.length}
                        ref={(el) => {
                          if (el) el.indeterminate = selectedCharges.size > 0 && selectedCharges.size < chargeRows.length
                        }}
                        onChange={() => setSelectedCharges(toggleAllOf(selectedCharges, chargeRows))}
                        aria-label={tSelection('selectAll')}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span className="text-xs text-muted-foreground">
                        {selectedCharges.size > 0
                          ? tSelection('summary', {
                              count: chargeSummary.count,
                              total: formatCurrency(chargeSummary.total, locale),
                            })
                          : tSelection('selectAll')}
                      </span>
                      {selectedCharges.size > 0 && (
                        <div className="ms-auto flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedCharges(new Map())}>
                            {tSelection('clear')}
                          </Button>
                          <Button size="sm" className="gap-1.5" onClick={() => setBulkOpen(true)}>
                            <CheckCheck size={14} />
                            {tBulk('action')}
                          </Button>
                        </div>
                      )}
                    </li>

                    {row.charges.map((charge) => (
                      <li
                        key={charge.id}
                        className="flex flex-wrap items-center gap-3 px-5 py-3 ps-14"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCharges.has(charge.id)}
                          onChange={() =>
                            setSelectedCharges(
                              toggleSelection(selectedCharges, chargeRowOf(row, charge))
                            )
                          }
                          aria-label={tSelection('selectRow', {
                            name: row.parentName,
                            amount: formatCurrency(charge.remaining, locale),
                          })}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        <div className="min-w-40 flex-1">
                          <Link
                            href={`/charges/${charge.id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {tCharges(`types.${charge.chargeType}` as Parameters<typeof tCharges>[0])}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {renderChargeNote(charge.notes, tRoot) ??
                              t('oldestAge', { days: charge.ageDays })}
                          </p>
                        </div>

                        <div className="text-end">
                          <span className="font-mono text-sm text-foreground" dir="ltr">
                            {formatCurrency(charge.remaining, locale)}
                          </span>
                          {charge.amountPaid > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {t('partiallyPaid', {
                                paid: formatCurrency(charge.amountPaid, locale),
                                total: formatCurrency(charge.amount, locale),
                              })}
                            </p>
                          )}
                        </div>

                        <StatusBadge status={charge.status} />

                        <div className="flex flex-wrap items-center gap-2">
                          <RecordPaymentDialog
                            chargeId={charge.id}
                            remaining={charge.remaining}
                            parentHasPhone={Boolean(row.phone)}
                            defaultNotifyParent={defaultNotifyParent}
                            action={recordPaymentAction}
                          />
                          <ResolveChargeDialog
                            chargeId={charge.id}
                            mode="waive"
                            action={waiveAction}
                            hasPaymentLink={charge.hasPaymentLink}                          />
                          {isOwner && (
                            <ResolveChargeDialog
                              chargeId={charge.id}
                              mode="void"
                              action={voidAction}
                              hasPaymentLink={charge.hasPaymentLink}                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <BulkMarkPaidDialog
        selection={selectedCharges}
        action={settleChargesAction}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onDone={() => setSelectedCharges(new Map())}
        defaultNotifyParent={defaultNotifyParent}
      />
    </div>
  )
}
