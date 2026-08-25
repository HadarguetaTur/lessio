'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronDown, CreditCard, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { RecordPaymentDialog, type RecordPaymentInput } from '@/components/dashboard/charges/RecordPaymentDialog'
import { ResolveChargeDialog } from '@/components/dashboard/charges/ResolveChargeDialog'
import { renderChargeNote } from '@/lib/charges/renderNote'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import type { DebtorRow } from '@/lib/charges/debtors'
import type { SendRemindersResult } from './actions'

interface DebtorsListProps {
  rows: DebtorRow[]
  locale: string
  isOwner: boolean
  sendRemindersAction: (parentIds: string[]) => Promise<SendRemindersResult>
  sendPaymentRequestsAction: (parentIds: string[]) => Promise<SendRemindersResult>
  recordPaymentAction: (input: RecordPaymentInput) => Promise<{ error: string | null }>
  waiveAction: (chargeId: string, reason: string) => Promise<{ error: string | null }>
  voidAction: (chargeId: string, reason: string) => Promise<{ error: string | null }>
}

export function DebtorsList({
  rows,
  locale,
  isOwner,
  sendRemindersAction,
  sendPaymentRequestsAction,
  recordPaymentAction,
  waiveAction,
  voidAction,
}: DebtorsListProps) {
  const t = useTranslations('debts')
  const tRoot = useTranslations()
  const tCharges = useTranslations('charges')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  // An opted-out parent cannot be messaged at all, so it is never selectable.
  const selectableIds = useMemo(
    () => rows.filter((r) => !r.optedOut && r.phone).map((r) => r.parentId),
    [rows]
  )

  const allSelected = selectableIds.length > 0 && selected.size === selectableIds.length

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
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const isExpanded = expanded === row.parentId
            const canMessage = !row.optedOut && Boolean(row.phone)

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
                        <span className="text-amber-600">{t('noPhone')}</span>
                      )}
                      {row.childrenNames.length > 0 && ` · ${row.childrenNames.join(', ')}`}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="font-mono text-sm font-semibold text-amber-600" dir="ltr">
                      {formatCurrency(row.totalDebt, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('chargeCount', { count: row.chargeCount })} ·{' '}
                      {t('oldestAge', { days: row.oldestAgeDays })}
                    </p>
                  </div>

                  {row.optedOut && (
                    <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {t('optedOut')}
                    </span>
                  )}

                  <div className="flex items-center gap-1">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isExpanded}
                      aria-label={t('toggleCharges')}
                      onClick={() => setExpanded(isExpanded ? null : row.parentId)}
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
                    {row.charges.map((charge) => (
                      <li
                        key={charge.id}
                        className="flex flex-wrap items-center gap-3 px-5 py-3 ps-14"
                      >
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
                            action={recordPaymentAction}
                          />
                          <ResolveChargeDialog
                            chargeId={charge.id}
                            mode="waive"
                            action={waiveAction}
                            hasPaymentLink={charge.hasPaymentLink}
                            hasInvoice={charge.hasInvoice}
                          />
                          {isOwner && (
                            <ResolveChargeDialog
                              chargeId={charge.id}
                              mode="void"
                              action={voidAction}
                              hasPaymentLink={charge.hasPaymentLink}
                              hasInvoice={charge.hasInvoice}
                            />
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
    </div>
  )
}
