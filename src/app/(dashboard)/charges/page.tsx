import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { getCharges, ChargeStatus } from '@/lib/charges'
import { getOrgTimezone } from '@/lib/organizations'
import { getParents } from '@/lib/parents'
import { MarkAsPaidButton } from '@/components/dashboard/charges/MarkAsPaidButton'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { renderChargeNote } from '@/lib/charges/renderNote'
import { markAsPaid } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const validStatuses: ChargeStatus[] = ['pending', 'invoiced', 'paid']

export default async function ChargesPage(props: {
  searchParams: Promise<{ status?: string; parent?: string; from?: string; to?: string }>
}) {
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()

  const statusFilter = validStatuses.includes(searchParams.status as ChargeStatus)
    ? (searchParams.status as ChargeStatus)
    : undefined

  const [charges, parents, timezone] = await Promise.all([
    getCharges(orgId, {
      status: statusFilter,
      parentId: searchParams.parent || undefined,
      dateFrom: searchParams.from || undefined,
      dateTo: searchParams.to || undefined,
    }),
    getParents(orgId),
    getOrgTimezone(orgId),
  ])

  const canMarkPaid = role === 'owner' || role === 'admin'
  const selectedParent = parents.find((parent) => parent.id === searchParams.parent)
  const t = await getTranslations('charges')
  const tp = await getTranslations('settings.paymentProviders')
  const tCommon = await getTranslations('common')

  const CHARGE_TYPE_LABELS: Record<string, string> = {
    lesson: t('types.lesson'),
    cancellation: t('types.cancellation'),
    manual: t('types.manual'),
    monthly: t('types.monthly'),
  }

  const monthStart = DateTime.now().setZone(timezone).startOf('month')
  const pendingTotal = charges.filter((c) => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0)
  const invoicedTotal = charges.filter((c) => c.status === 'invoiced').reduce((sum, c) => sum + c.amount, 0)
  const paidThisMonth = charges
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
            <p className="text-lg font-bold text-foreground">₪{pendingTotal.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('agingSummary.invoiced')}
            </p>
            <p className="text-lg font-bold text-foreground">₪{invoicedTotal.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('agingSummary.paidThisMonth')}
            </p>
            <p className="text-lg font-bold text-emerald-600">₪{paidThisMonth.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <form method="GET" className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-5">
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="pending">{tCommon('chargeStatus.pending')}</option>
          <option value="invoiced">{tCommon('chargeStatus.invoiced')}</option>
          <option value="paid">{tCommon('chargeStatus.paid')}</option>
        </select>

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

        <input
          name="from"
          type="date"
          defaultValue={searchParams.from ?? ''}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          name="to"
          type="date"
          defaultValue={searchParams.to ?? ''}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="flex items-center gap-2 xl:justify-end">
          <Button type="submit">{t('filter')}</Button>
          <Button asChild variant="outline">
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
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('paymentLink')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('fields.receiptUrl')}
                  </TableHead>
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
                        <div className="mt-0.5 max-w-[120px] truncate text-xs text-muted-foreground/70">
                          {renderChargeNote(charge.notes, t)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm font-semibold text-foreground font-mono" dir="ltr">
                      ₪{charge.amount.toFixed(2)}
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
                    </TableCell>
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
                    <TableCell className="px-5 py-3.5">
                      {charge.receipt_url ? (
                        <a
                          href={charge.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-600 hover:underline"
                        >
                          {t('receiptLabel')}
                        </a>
                      ) : charge.status === 'paid' ? (
                        <span className="text-xs text-muted-foreground">{t('noReceipt')}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/30">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm text-muted-foreground">
                      {new Date(charge.created_at).toLocaleDateString('he-IL')}
                    </TableCell>
                    {canMarkPaid && (
                      <TableCell className="px-5 py-3.5">
                        {charge.status !== 'paid' ? (
                          <MarkAsPaidButton chargeId={charge.id} action={markAsPaid} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{tCommon('chargeStatus.paid')}</span>
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
