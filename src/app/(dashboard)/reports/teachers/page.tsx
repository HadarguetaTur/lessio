import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeachersReport } from '@/lib/reports/teachers'
import { parseReportMonths } from '@/lib/reports/params'
import { TeachersChart } from '@/components/reports/TeachersChart'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
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
 * Teachers report page.
 * Per /docs/sprint-17-scope.md § Story 6.
 */

interface Props {
  searchParams: Promise<{ months?: string }>
}

export default async function TeachersReportPage({ searchParams }: Props) {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')
  await requireFeature(session.orgId, 'full_reports')

  const { months: monthsParam } = await searchParams
  const months = parseReportMonths(monthsParam, { defaultValue: 3, maxValue: 12 })

  const timezone = await getOrgTimezone(session.orgId)
  const { rows } = await getTeachersReport(session.orgId, timezone, months)

  const [locale, t] = await Promise.all([getLocale(), getTranslations('reports')])
  const intlLoc = toIntlLocale(parseAppLocale(locale))

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('teachers.title')}
        subtitle={t('teachers.pageSubtitle', { count: rows.length })}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <PeriodSelector current={months} options={[1, 3, 6, 12]} />
            <CsvDownloadButton report="teachers" params={{ months: String(months) }} />
          </div>
        }
      />

      {rows.length > 0 && (
        <div className="mb-6 min-w-0 rounded-xl border border-border bg-card p-6">
          <TeachersChart rows={rows} />
        </div>
      )}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain">
          <Table className="min-w-[480px] w-full">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-muted-foreground backdrop-blur">{t('teachers.nameColumn')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('teachers.lessons')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('teachers.revenue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.teacherId} className="hover:bg-muted/20">
                  <TableCell className="px-4 py-3 font-medium text-foreground">{r.teacherName}</TableCell>
                  <TableCell className="px-4 py-3 tabular-nums text-foreground text-end">{r.lessonsCount}</TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">
                    ₪{r.revenue.toLocaleString(intlLoc)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    {t('teachers.emptyPeriod')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
