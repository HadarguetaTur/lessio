import { redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { getDebtReport } from '@/lib/reports/debt'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { UrlSearchField } from '@/components/dashboard/UrlSearchField'
import { matchesSearch } from '@/lib/search/text'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Debt report page — parents with pending charges.
 * Per /docs/sprint-17-scope.md § Story 5.
 */

export default async function DebtReportPage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const searchParams = await props.searchParams
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')
  await requireFeature(session.orgId, 'full_reports')

  const { rows, totalDebt } = await getDebtReport(session.orgId)
  const [locale, t, tCommon] = await Promise.all([
    getLocale(),
    getTranslations('reports'),
    getTranslations('common'),
  ])
  const intlLoc = toIntlLocale(parseAppLocale(locale))
  const money = (amount: number) => formatMoney(amount, locale)
  // The header keeps the org-wide total — the search narrows the table, not the report.
  const amountStr = money(totalDebt)

  const search = searchParams.q?.trim() ?? ''
  const visibleRows = rows.filter((r) => matchesSearch(search, { names: [r.parentName], phones: [r.phone] }))

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('debt.title')}
        subtitle={t('debt.pageSubtitle', { amount: amountStr, parentCount: rows.length })}
        actions={<CsvDownloadButton report="debt" />}
      />

      {rows.length > 0 && (
        <div className="mb-5">
          <UrlSearchField q={search} placeholder={t('debt.searchPlaceholder')} className="sm:max-w-xs" />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('debt.emptyTitle')}
          subtitle={t('debt.emptySubtitle')}
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState icon={Receipt} title={tCommon('emptyStates.noResults')} />
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain">
            <Table className="min-w-[640px] w-full">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-muted-foreground backdrop-blur">{t('debt.parent')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('debt.phone')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('debt.balance')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('debt.dueDate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(r => (
                  <TableRow key={r.parentId} className="hover:bg-muted/20">
                    <TableCell className="px-4 py-3 font-medium text-foreground">{r.parentName}</TableCell>
                    <TableCell className="px-4 py-3 tabular-nums text-muted-foreground text-end" dir="ltr">{r.phone}</TableCell>
                    <TableCell className="px-4 py-3 font-semibold tabular-nums text-destructive text-end">
                      {money(r.totalDebt)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground text-end">
                      {r.oldestDueDate
                        ? new Date(r.oldestDueDate).toLocaleDateString(intlLoc)
                        : t('dash')}
                    </TableCell>
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
