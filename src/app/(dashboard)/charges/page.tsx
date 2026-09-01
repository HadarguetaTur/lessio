import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { getCharges, ChargeStatus, findChargeParentIds, getChargeRemaining } from '@/lib/charges'
import { getOrgTimezone } from '@/lib/organizations'
import { getOrgProviderStatus } from '@/lib/organizations/providerStatus'
import { getParents } from '@/lib/parents'
import { ChargeRowActions } from '@/components/dashboard/charges/ChargeRowActions'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { renderChargeNote } from '@/lib/charges/renderNote'
import { waiveChargeAction, voidChargeAction, recordChargePaymentAction } from './actions'
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
  searchParams: Promise<{ status?: string; parent?: string; q?: string; from?: string; to?: string }>
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
  const matchingParentIds = search ? await findChargeParentIds(orgId, search) : undefined

  const [charges, allCharges, parents, timezone] = await Promise.all([
    getCharges(orgId, {
      status: statusFilter,
      parentId: searchParams.parent || undefined,
      parentIds: matchingParentIds,
      dateFrom: searchParams.from || undefined,
      dateTo: searchParams.to || undefined,
    }),
    getCharges(orgId),
    getParents(orgId),
    getOrgTimezone(orgId),
  ])

  const canMarkPaid = role === 'owner' || role === 'admin'
  const isOwner = role === 'owner'
  const selectedParent = parents.find((parent) => parent.id === searchParams.parent)
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

  const monthStart = DateTime.now().setZone(timezone).startOf('month')
  // Open buckets show what is still owed; a partially-paid charge counts for its remainder.
  const pendingTotal = allCharges
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + remainingOf(c), 0)
  const invoicedTotal = allCharges
    .filter((c) => c.status === 'invoiced')
    .reduce((sum, c) => sum + remainingOf(c), 0)
  const paidThisMonth = allCharges
    .filter((c) =>
      c.status === 'paid' &&
      c.paid_at &&
      DateTime.fromISO(c.paid_at, { zone: 'utc' }).setZone(timezone) >= monthStart
    )
    .reduce((sum, c) => sum + c.amount, 0)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <LiveRefresh tables={['charges']} />
      <PageHeader title={t('title')} />

      {/* Aging summary */}
      {charges.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('agingSummary.pending')}
            </p>
            <p className="text-lg font-bold text-foreground">{money(pendingTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('agingSummary.invoiced')}
            </p>
            <p className="text-lg font-bold text-foreground">{money(invoicedTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('agingSummary.paidThisMonth')}
            </p>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{money(paidThisMonth)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 md:hidden">
        <details className="rounded-xl border border-border bg-card p-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
            {t('filter')} / {tCommon('table.status')}
          </summary>
          <div className="pt-3">
            <form method="GET" className="grid items-end gap-3">
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
                  <option value="invoiced">{tCommon('chargeStatus.invoiced')}</option>
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
            <option value="invoiced">{tCommon('chargeStatus.invoiced')}</option>
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

      {selectedParent && (
        <p className="mb-4 text-sm text-muted-foreground">
          {t('showingFor')}{' '}
          <span className="font-medium text-foreground">{selectedParent.full_name}</span>
        </p>
      )}

      {charges.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('noCharges')}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-full overflow-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
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
                    <TableCell className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={charge.parent.full_name} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{charge.parent.full_name}</p>
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
                            recordPaymentAction={recordChargePaymentAction}
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
        </div>
      )}
    </div>
  )
}
