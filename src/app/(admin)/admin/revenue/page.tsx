import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'
import { ExternalLink } from 'lucide-react'

import { formatMoney } from '@/lib/i18n/formatCurrency'
import { getSaasMetrics } from '@/lib/superadmin/metrics'
import {
  computeRevenueTotals,
  listSaasInvoicesForPlatform,
} from '@/lib/superadmin/revenue'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import { MrrHistoryChart } from '@/components/admin/MrrHistoryChart'
import { cn } from '@/lib/utils'

/**
 * The platform's own income.
 *
 * Per /docs/sprint-34-scope.md § /admin/revenue. Replaces /admin/billing, which
 * summed `charges` — a teacher billing a parent — and so reported the tenants'
 * revenue on a screen labelled with the platform's.
 */
export default async function AdminRevenuePage() {
  const t = await getTranslations('admin.revenue')
  const tTable = await getTranslations('admin.table')
  const locale = await getLocale()

  const [{ metrics }, invoices] = await Promise.all([
    getSaasMetrics(),
    listSaasInvoicesForPlatform(),
  ])
  const totals = computeRevenueTotals(invoices)

  const money = (n: number) => formatMoney(Math.round(n), locale)
  const fmtDate = (iso: string | null) =>
    iso ? DateTime.fromISO(iso).setLocale(locale).toFormat('dd LLL yyyy') : null

  const cards = [
    { label: t('mrr'), value: money(metrics.mrr), tone: 'default' as const },
    { label: t('collectedThisMonth'), value: money(totals.collectedThisMonth), tone: 'default' as const },
    { label: t('pending'), value: money(totals.pendingAmount), tone: 'warning' as const },
    {
      label: t('failed'),
      value: money(totals.failedAmount),
      sub: t('failedCount', { count: totals.failedCount }),
      tone: totals.failedCount > 0 ? ('critical' as const) : ('default' as const),
    },
  ]

  const rows: AdminTableRow[] = invoices.map((inv) => ({
    id: inv.id,
    cells: {
      org: (
        <Link href={`/admin/orgs/${inv.organizationId}`} className="font-medium hover:underline">
          {inv.organizationName}
        </Link>
      ),
      amount: money(inv.amount),
      status: (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            inv.status === 'paid' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
            inv.status === 'pending' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            inv.status === 'failed' && 'bg-destructive/10 text-destructive'
          )}
        >
          {t(`status.${inv.status}`)}
        </span>
      ),
      period:
        inv.periodStart && inv.periodEnd
          ? `${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}`
          : null,
      issued: fmtDate(inv.issuedAt ?? inv.createdAt),
      document: inv.documentUrl ? (
        <a
          href={inv.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs hover:underline"
        >
          {t('viewDocument')}
          <ExternalLink size={11} />
        </a>
      ) : null,
    },
    sortValues: {
      org: inv.organizationName,
      amount: inv.amount,
      status: inv.status,
      issued: inv.issuedAt ?? inv.createdAt,
    },
    csv: {
      org: inv.organizationName,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      period: inv.periodStart && inv.periodEnd ? `${inv.periodStart}/${inv.periodEnd}` : '',
      issued: inv.issuedAt ?? inv.createdAt,
    },
  }))

  return (
    <div className="mx-auto max-w-6xl">
      <AdminHeader title={t('title')} description={t('description')} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-background p-5">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <p
              className={cn(
                'mt-1 text-2xl font-bold tabular-nums',
                c.tone === 'critical' && 'text-destructive',
                c.tone === 'warning' && 'text-amber-600'
              )}
            >
              {c.value}
            </p>
            {c.sub && <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="mb-6">
        <MrrHistoryChart months={totals.monthly} />
      </div>

      <h2 className="mb-3 text-sm font-semibold">{t('invoices')}</h2>
      <AdminTable
        exportName="lessio-saas-invoices"
        emptyLabel={tTable('empty')}
        columns={[
          { key: 'org', label: t('columns.org'), sortable: true },
          { key: 'amount', label: t('columns.amount'), numeric: true, align: 'end', sortable: true },
          { key: 'status', label: t('columns.status'), sortable: true },
          { key: 'period', label: t('columns.period'), numeric: true, secondary: true },
          { key: 'issued', label: t('columns.issued'), numeric: true, sortable: true },
          { key: 'document', label: '', align: 'end' },
        ]}
        rows={rows}
      />
    </div>
  )
}
