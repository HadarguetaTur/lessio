import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getLessonsReport } from '@/lib/reports/lessons'
import { parseReportMonths } from '@/lib/reports/params'
import { LessonsChart } from '@/components/reports/LessonsChart'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { PeriodSelector } from '@/components/reports/PeriodSelector'
import { getLocale, getTranslations } from 'next-intl/server'
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
 * Lessons report page.
 * Per /docs/sprint-17-scope.md § Story 4.
 */

interface Props {
  searchParams: Promise<{ months?: string }>
}

export default async function LessonsReportPage({ searchParams }: Props) {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  const { months: monthsParam } = await searchParams
  const months = parseReportMonths(monthsParam, { defaultValue: 12, maxValue: 24 })

  const timezone = await getOrgTimezone(session.orgId)
  const [locale, t] = await Promise.all([getLocale(), getTranslations('reports')])
  const appLocale = parseAppLocale(locale)
  const { buckets, totalScheduled, totalCancelled } = await getLessonsReport(
    session.orgId,
    timezone,
    months,
    appLocale
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('lessons.title')}
        subtitle={t('lessons.pageSubtitle', {
          scheduled: totalScheduled,
          cancelled: totalCancelled,
        })}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <PeriodSelector current={months} />
            <CsvDownloadButton report="lessons" params={{ months: String(months) }} />
          </div>
        }
      />

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <LessonsChart buckets={buckets} />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="h-full min-h-0 min-w-0 overflow-auto overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0">
          <Table className="min-w-[480px] w-full">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-muted-foreground backdrop-blur">{t('lessons.tableMonth')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('lessons.completed')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">{t('lessons.cancelled')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...buckets].reverse().map(b => (
                <TableRow key={b.month} className="hover:bg-muted/20">
                  <TableCell className="px-4 py-3 text-foreground">{b.label}</TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-foreground text-end">{b.count}</TableCell>
                  <TableCell className="px-4 py-3 tabular-nums text-destructive text-end">{b.cancelled}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
