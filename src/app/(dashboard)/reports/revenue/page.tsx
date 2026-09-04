import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { getOrgTimezone } from '@/lib/organizations'
import { getRevenueReport } from '@/lib/reports/revenue'
import { parseReportMonths } from '@/lib/reports/params'
import { RevenueChart } from '@/components/reports/RevenueChart'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import AccountingExportButton from './AccountingExportButton'
import { PeriodSelector } from '@/components/reports/PeriodSelector'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { parseAppLocale } from '@/lib/i18n/locale'
import { PageHeader } from '@/components/ui/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Revenue report page.
 * Per /docs/sprint-17-scope.md § Story 3.
 */

interface Props {
  searchParams: Promise<{ months?: string }>
}

export default async function RevenueReportPage({ searchParams }: Props) {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')
  await requireFeature(session.orgId, 'full_reports')

  const { months: monthsParam } = await searchParams
  const months = parseReportMonths(monthsParam, { defaultValue: 12, maxValue: 24 })

  const timezone = await getOrgTimezone(session.orgId)
  const [locale, t] = await Promise.all([getLocale(), getTranslations('reports')])
  const appLocale = parseAppLocale(locale)
  const money = (amount: number) => formatMoney(amount, appLocale)
  const { buckets, total, billingTotal, billingPaid } = await getRevenueReport(
    session.orgId,
    timezone,
    months,
    appLocale
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('revenue.title')}
        subtitle={`${t('revenue.revenue')}: ${money(total)} · ${t('revenue.monthlyBilling')}: ${money(billingTotal)} · ${t('revenue.monthlyBillingPaid')}: ${money(billingPaid)}`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <PeriodSelector current={months} />
          <CsvDownloadButton report="revenue" params={{ months: String(months) }} />
          <AccountingExportButton />
          </div>
        }
      />

      <div className="mb-6 min-w-0 rounded-xl border border-border bg-card p-6">
        <RevenueChart buckets={buckets} />
      </div>

      {/* Four money columns with near-identical names sat side by side with
          nothing saying which one is "what I actually earned" — a month can
          legitimately read ₪0 revenue beside ₪22,220 billed-and-paid. */}
      <p className="mb-2 text-xs text-muted-foreground">{t('revenue.columnsLegend')}</p>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* tabIndex: the table scrolls sideways on narrow screens, so it needs
            to be reachable without a pointer. */}
        <div
          tabIndex={0}
          role="region"
          aria-label={t('revenue.title')}
          className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain"
        >
          <Table className="min-w-[720px] w-full">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-muted-foreground backdrop-blur">{t('revenue.month')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('revenue.revenue')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('revenue.monthlyBilling')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('revenue.monthlyBillingPaid')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('revenue.monthlyBillingOpen')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...buckets].reverse().map(b => (
                <TableRow key={b.month} className="hover:bg-muted/20">
                  <TableCell className="px-4 py-3 text-foreground">{b.label}</TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">
                    {money(b.revenue)}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">
                    {money(b.billingTotal)}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">
                    {money(b.billingPaid)}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">
                    {money(b.billingTotal - b.billingPaid)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
