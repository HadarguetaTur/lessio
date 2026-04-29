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
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
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
  const intlLoc = toIntlLocale(appLocale)
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
        subtitle={`${t('revenue.revenue')}: ₪${total.toLocaleString(intlLoc)} · ${t('revenue.monthlyBilling')}: ₪${billingTotal.toLocaleString(intlLoc)} · ${t('revenue.monthlyBillingPaid')}: ₪${billingPaid.toLocaleString(intlLoc)}`}
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

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain">
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
                    ₪{b.revenue.toLocaleString(intlLoc)}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">
                    ₪{b.billingTotal.toLocaleString(intlLoc)}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">
                    ₪{b.billingPaid.toLocaleString(intlLoc)}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">
                    ₪{(b.billingTotal - b.billingPaid).toLocaleString(intlLoc)}
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
