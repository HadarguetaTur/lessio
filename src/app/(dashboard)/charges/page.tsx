import Link from 'next/link'
import { AlertCircle, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import {
  getCharges,
  ChargeStatus,
  findChargeParentIds,
  getChargeRemaining,
  getOpenBalancesByParent,
} from '@/lib/charges'
import { getChargeDateRange } from '@/lib/charges/dateRange'
import { getChargesSummary } from '@/lib/charges/summary'
import type { SelectedCharge } from '@/lib/charges/selection'
import { getOrgTimezone } from '@/lib/organizations'
import { getOrgProviderStatus } from '@/lib/organizations/providerStatus'
import { getPaymentConfirmationDefault } from '@/lib/organizations/paymentNotification'
import { getParents } from '@/lib/parents'
import { ChargeRowActions } from '@/components/dashboard/charges/ChargeRowActions'
import { SettleBalanceDialog } from '@/components/dashboard/charges/SettleBalanceDialog'
import {
  BulkMarkPaidBar,
  ChargeSelectCheckbox,
  ChargeSelectionProvider,
  SelectAllCheckbox,
} from '@/components/dashboard/charges/ChargeSelection'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { renderChargeNote } from '@/lib/charges/renderNote'
import {
  waiveChargeAction,
  voidChargeAction,
  recordChargePaymentAction,
  settleParentBalanceAction,
  settleChargesAction,
} from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const validStatuses: ChargeStatus[] = ['pending', 'invoiced', 'paid', 'waived', 'voided']

const OPEN_STATUSES: ChargeStatus[] = ['pending', 'invoiced']

/** What is still owed on a charge, after any partial payment. */
function remainingOf(charge: { amount: number; amount_paid: number }): number {
  return getChargeRemaining(charge.amount, charge.amount_paid)
}

export default async function ChargesPage(props: {
  searchParams: Promise<{ status?: string; parent?: string; q?: string; from?: string; to?: string; due?: string }>
}) {
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()

  const statusFilter = validStatuses.includes(searchParams.status as ChargeStatus)
    ? (searchParams.status as ChargeStatus)
    : undefined

  // Two columns that can only ever hold a value once an org connects a
  // provider. Until then they are a wall of em-dashes, so they stay hidden.
  const providers = await getOrgProviderStatus(orgId)
  const hasPaymentProvider = providers.hasPayment
  const hasReceiptProvider = providers.hasReceipt

  const search = searchParams.q?.trim() ?? ''
  const overdueOnly = searchParams.due === 'overdue'

  // "Overdue" is a calendar-date comparison in the org's own timezone, so the
  // zone has to be known before the ledger query can be built.
  const [matchingParentIds, timezone, defaultNotifyParent] = await Promise.all([
    search ? findChargeParentIds(orgId, search) : Promise.resolve(undefined),
    getOrgTimezone(orgId),
    getPaymentConfirmationDefault(orgId),
  ])
  const todayLocal = DateTime.now().setZone(timezone).toISODate()!
  const dateRange = getChargeDateRange(searchParams.from, searchParams.to, timezone)

  const [charges, summary, parents] = await Promise.all([
    getCharges(orgId, {
      status: statusFilter,
      parentId: searchParams.parent || undefined,
      parentIds: matchingParentIds,
      dateFrom: dateRange.fromInclusive,
      dateToExclusive: dateRange.toExclusive,
      overdueBefore: overdueOnly ? todayLocal : undefined,
    }),
    getChargesSummary(orgId, timezone),
    getParents(orgId),
  ])

  const canMarkPaid = role === 'owner' || role === 'admin'
  const isOwner = role === 'owner'
  const selectedParent = parents.find((parent) => parent.id === searchParams.parent)

  // Whole open balance per parent on the page — the rows here may be narrowed
  // by status or date, and "settle the whole balance" must mean all of it.
  const parentIdsOnPage = [...new Set(charges.map((c) => c.parent.id))]
  const openBalances = canMarkPaid
    ? await getOpenBalancesByParent(orgId, parentIdsOnPage)
    : new Map<string, { total: number; count: number }>()
  const selectedParentBalance = selectedParent ? openBalances.get(selectedParent.id) : undefined

  // The rows a tick can settle: open charges only, described well enough for the
  // bulk dialog to name the parents and total the money without another query.
  const selectableRows: SelectedCharge[] = canMarkPaid
    ? charges
        .filter((c) => OPEN_STATUSES.includes(c.status) && remainingOf(c) > 0)
        .map((c) => ({
          chargeId: c.id,
          parentId: c.parent.id,
          parentName: c.parent.full_name,
          parentHasPhone: Boolean(c.parent.phone),
          remaining: remainingOf(c),
        }))
    : []
  const selectableById = new Map(selectableRows.map((r) => [r.chargeId, r]))
  const t = await getTranslations('charges')
  const tp = await getTranslations('settings.paymentProviders')
  const tCommon = await getTranslations('common')
  const tRoot = await getTranslations()
  const appLocale = parseAppLocale(await getLocale())
  const intlLocale = toIntlLocale(appLocale)
  const money = (amount: number) => formatMoney(amount, appLocale)

  const CHARGE_TYPE_LABELS: Record<string, string> = {
    lesson: t('types.lesson'),
    cancellation: t('types.cancellation'),
    manual: t('types.manual'),
    monthly: t('types.monthly'),
  }

  // What the current filter shows — the cards above stay org-wide.
  const filteredTotal = charges.reduce((sum, c) => sum + c.amount, 0)
  const filteredOpen = charges
    .filter((c) => OPEN_STATUSES.includes(c.status))
    .reduce((sum, c) => sum + remainingOf(c), 0)

  // A card is "active" only when the URL is exactly the filter it links to, so
  // the ring never lies about what the table underneath is showing.
  const hasNarrowingFilters = Boolean(
    search || searchParams.parent || searchParams.from || searchParams.to
  )
  const openCardActive = statusFilter === 'pending' && !overdueOnly && !hasNarrowingFilters
  const overdueCardActive = overdueOnly && !statusFilter && !hasNarrowingFilters

  const isOverdue = (charge: { status: ChargeStatus; due_date: string | null }) =>
    OPEN_STATUSES.includes(charge.status) && charge.due_date !== null && charge.due_date < todayLocal
  const overdueDays = (dueDate: string) =>
    Math.max(1, Math.floor(DateTime.fromISO(todayLocal).diff(DateTime.fromISO(dueDate), 'days').days))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <LiveRefresh tables={['charges']} />
      <PageHeader title={t('title')} />

      {/* Collections at a glance — org-wide, never narrowed by the filters below. */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label={t('summary.open')}
          value={money(summary.openTotal)}
          subLabel={
            summary.openDebtorCount > 0
              ? t('summary.openSub', { count: summary.openDebtorCount })
              : t('summary.openNone')
          }
          icon={Wallet}
          variant={summary.openTotal > 0 ? 'debt' : 'default'}
          href="/charges?status=pending"
          className={openCardActive ? 'ring-2 ring-primary' : undefined}
        />
        <KpiCard
          label={t('summary.overdue')}
          value={money(summary.overdueTotal)}
          subLabel={
            summary.overdueCount > 0
              ? t('summary.overdueSub', { count: summary.overdueCount })
              : t('summary.overdueNone')
          }
          icon={AlertCircle}
          variant={summary.overdueTotal > 0 ? 'warning' : 'default'}
          href="/charges?due=overdue"
          className={overdueCardActive ? 'ring-2 ring-primary' : undefined}
        />
        <KpiCard
          label={t('summary.collected')}
          value={money(summary.collectedThisMonth)}
          subLabel={t('summary.collectedSub')}
          icon={TrendingUp}
          variant="revenue"
          href="/reports/revenue"
        />
      </div>

      {/* Filters */}
      <div className="mb-5 md:hidden">
        <details className="rounded-xl border border-border bg-card p-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
            {t('filter')} / {tCommon('table.status')}
          </summary>
          <div className="pt-3">
            <form method="GET" className="grid items-end gap-3">
              {overdueOnly && <input type="hidden" name="due" value="overdue" />}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('searchLabel')}
                <input
                  name="q"
                  type="search"
                  defaultValue={search}
                  placeholder={t('searchPlaceholder')}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {tCommon('table.status')}
                <select
                  name="status"
                  defaultValue={searchParams.status ?? ''}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t('allStatuses')}</option>
                  <option value="pending">{tCommon('chargeStatus.pending')}</option>
                  <option value="paid">{tCommon('chargeStatus.paid')}</option>
                  <option value="waived">{tCommon('chargeStatus.waived')}</option>
                  <option value="voided">{tCommon('chargeStatus.voided')}</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('fields.parent')}
                <select
                  name="parent"
                  defaultValue={searchParams.parent ?? ''}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t('allParents')}</option>
                  {parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filterFrom')}
                <input
                  name="from"
                  type="date"
                  defaultValue={searchParams.from ?? ''}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filterTo')}
                <input
                  name="to"
                  type="date"
                  defaultValue={searchParams.to ?? ''}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              <div className="flex items-center gap-2">
                <Button type="submit" className="h-10">{t('filter')}</Button>
                <Button asChild variant="outline" className="h-10">
                  <Link href="/charges">{t('reset')}</Link>
                </Button>
              </div>
            </form>
          </div>
        </details>
      </div>

      <form method="GET" className="mb-5 hidden items-end gap-3 rounded-xl border border-border bg-card p-4 md:grid md:grid-cols-2 xl:grid-cols-6">
        {overdueOnly && <input type="hidden" name="due" value="overdue" />}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2 xl:col-span-1">
          {t('searchLabel')}
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder={t('searchPlaceholder')}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {tCommon('table.status')}
          <select
            name="status"
            defaultValue={searchParams.status ?? ''}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t('allStatuses')}</option>
            <option value="pending">{tCommon('chargeStatus.pending')}</option>
            <option value="paid">{tCommon('chargeStatus.paid')}</option>
            <option value="waived">{tCommon('chargeStatus.waived')}</option>
            <option value="voided">{tCommon('chargeStatus.voided')}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('fields.parent')}
          <select
            name="parent"
            defaultValue={searchParams.parent ?? ''}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t('allParents')}</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('filterFrom')}
          <input
            name="from"
            type="date"
            defaultValue={searchParams.from ?? ''}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('filterTo')}
          <input
            name="to"
            type="date"
            defaultValue={searchParams.to ?? ''}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <div className="flex items-center gap-2 xl:justify-end">
          <Button type="submit" className="h-10">{t('filter')}</Button>
          <Button asChild variant="outline" className="h-10">
            <Link href="/charges">{t('reset')}</Link>
          </Button>
        </div>
      </form>

      {(selectedParent || charges.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          {selectedParent && (
            <span>
              {t('showingFor')}{' '}
              <span className="font-medium text-foreground">{selectedParent.full_name}</span>
            </span>
          )}
          {charges.length > 0 && (
            <span>
              {t('summary.results', {
                count: charges.length,
                total: money(filteredTotal),
                open: money(filteredOpen),
              })}
            </span>
          )}
          {/* One parent in view with something owed: settle it all from here,
              instead of one dialog per row. */}
          {canMarkPaid && selectedParent && selectedParentBalance && (
            <span className="ms-auto">
              <SettleBalanceDialog
                parentId={selectedParent.id}
                parentName={selectedParent.full_name}
                total={selectedParentBalance.total}
                chargeCount={selectedParentBalance.count}
                parentHasPhone={Boolean(selectedParent.phone)}
                defaultNotifyParent={defaultNotifyParent}
                action={settleParentBalanceAction}
              />
            </span>
          )}
        </div>
      )}

      {charges.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('noCharges')}
        />
      ) : (
        <ChargeSelectionProvider selectableIds={selectableRows.map((r) => r.chargeId)}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[1020px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {canMarkPaid && (
                    <TableHead className="sticky top-0 z-10 w-10 bg-muted/95 px-3 text-start backdrop-blur">
                      <SelectAllCheckbox rows={selectableRows} />
                    </TableHead>
                  )}
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('fields.parent')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('tableType')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.amount')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.status')}
                  </TableHead>
                  {hasPaymentProvider && (
                    <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                      {t('paymentLink')}
                    </TableHead>
                  )}
                  {hasReceiptProvider && (
                    <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                      {t('fields.receiptUrl')}
                    </TableHead>
                  )}
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.date')}
                  </TableHead>
                  {canMarkPaid && (
                    <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                      {tCommon('table.actions')}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((charge) => (
                  <TableRow key={charge.id} className="hover:bg-muted/20">
                    {canMarkPaid && (
                      <TableCell className="w-10 px-3 py-3.5">
                        {/* Only an open charge can be settled; a closed row keeps
                            the column's width without offering an action. */}
                        {selectableById.get(charge.id) ? (
                          <ChargeSelectCheckbox charge={selectableById.get(charge.id)!} />
                        ) : null}
                      </TableCell>
                    )}
                    <TableCell className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={charge.parent.full_name} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{charge.parent.full_name}</p>
                          {/* The payer is not the recipient: /billing lists this
                              same money by student. */}
                          {charge.student_name && (
                            <p className="text-xs text-muted-foreground">{charge.student_name}</p>
                          )}
                          <Link
                            href={`/charges/${charge.id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            {t('details')}
                          </Link>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm text-muted-foreground">
                      <div>{CHARGE_TYPE_LABELS[charge.charge_type] ?? charge.charge_type}</div>
                      {charge.notes && (
                        <div className="mt-0.5 max-w-[120px] truncate text-xs text-muted-foreground">
                          {renderChargeNote(charge.notes, tRoot)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right text-sm font-semibold text-foreground font-mono" dir="ltr">
                      {money(charge.amount)}
                      {charge.amount_paid > 0 && charge.status !== 'paid' && (
                        <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                          {t('partiallyPaid', {
                            paid: money(charge.amount_paid),
                            total: money(charge.amount),
                          })}
                        </div>
                      )}
                      {OPEN_STATUSES.includes(charge.status) && (
                        <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                          {t('payments.remaining', {
                            amount: money(remainingOf(charge)),
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge status={charge.status} />
                      {charge.status === 'paid' && charge.payment_provider && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {t('via', { provider: getProviderUI(charge.payment_provider) ? tp(`${charge.payment_provider}.label`) : charge.payment_provider })}
                        </div>
                      )}
                      {charge.status === 'paid' && !charge.payment_provider && charge.paid_at && (
                        <div className="mt-1 text-[10px] text-muted-foreground">{t('markedManually')}</div>
                      )}
                      {charge.resolution_reason && (
                        <div className="mt-1 max-w-[160px] truncate text-[10px] text-muted-foreground" title={charge.resolution_reason}>
                          {charge.resolution_reason}
                        </div>
                      )}
                    </TableCell>
                    {hasPaymentProvider && (
                      <TableCell className="px-5 py-3.5">
                        {charge.payment_link ? (
                          <a
                            href={charge.payment_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                            title={charge.payment_link}
                          >
                            {t('paymentLinkLabel')}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                    )}
                    {hasReceiptProvider && (
                      <TableCell className="px-5 py-3.5">
                        {charge.receipt_url ? (
                          <a
                            href={charge.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-700 hover:underline"
                          >
                            {t('receiptLabel')}
                          </a>
                        ) : charge.status === 'paid' ? (
                          <span className="text-xs text-muted-foreground">{t('noReceipt')}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="px-5 py-3.5 text-sm text-muted-foreground">
                      {new Date(charge.created_at).toLocaleDateString(intlLocale)}
                      {isOverdue(charge) && charge.due_date && (
                        <div className="mt-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                          {t('summary.overdueBy', { days: overdueDays(charge.due_date) })}
                        </div>
                      )}
                    </TableCell>
                    {canMarkPaid && (
                      <TableCell className="px-5 py-3.5">
                        {OPEN_STATUSES.includes(charge.status) ? (
                          <ChargeRowActions
                            chargeId={charge.id}
                            remaining={remainingOf(charge)}
                            isOwner={isOwner}
                            hasPaymentLink={Boolean(charge.payment_link)}
                            hasInvoice={charge.has_invoice}
                            parent={{
                              id: charge.parent.id,
                              name: charge.parent.full_name,
                              hasPhone: Boolean(charge.parent.phone),
                            }}
                            parentBalance={openBalances.get(charge.parent.id)}
                            defaultNotifyParent={defaultNotifyParent}
                            recordPaymentAction={recordChargePaymentAction}
                            settleAction={settleParentBalanceAction}
                            waiveAction={waiveChargeAction}
                            voidAction={voidChargeAction}
                          />
                        ) : (
                          // A closed charge has no actions; the status column
                          // two cells over already names its state.
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {canMarkPaid && (
            <BulkMarkPaidBar
              action={settleChargesAction}
              defaultNotifyParent={defaultNotifyParent}
            />
          )}
        </div>
        </ChargeSelectionProvider>
      )}
    </div>
  )
}
