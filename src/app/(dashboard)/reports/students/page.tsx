import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getStudentsReport } from '@/lib/reports/students'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { DateTime } from 'luxon'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toLuxonLocale } from '@/lib/i18n/locale'
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
 * Students report page — activity overview and at-risk detection.
 * Per /docs/sprint-17-scope.md § Story 7.
 */

export default async function StudentsReportPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  const timezone = await getOrgTimezone(session.orgId)
  const { rows, atRiskCount } = await getStudentsReport(session.orgId, timezone)

  const [locale, t] = await Promise.all([getLocale(), getTranslations('reports')])
  const appLocale = parseAppLocale(locale)
  const luxonLoc = toLuxonLocale(appLocale)

  function formatDate(iso: string | null): string {
    if (!iso) return t('dash')
    const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone).setLocale(luxonLoc)
    return appLocale === 'he'
      ? dt.toFormat('d בLLLL yyyy')
      : dt.toFormat('LLLL d, yyyy')
  }

  const subtitle =
    atRiskCount > 0
      ? t('students.pageSubtitleWithRisk', { count: rows.length, atRisk: atRiskCount })
      : t('students.pageSubtitle', { count: rows.length })

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('students.title')}
        subtitle={subtitle}
        actions={<CsvDownloadButton report="students" />}
      />

      {atRiskCount > 0 && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="mb-2 text-sm font-semibold text-destructive">{t('students.atRiskBannerTitle')}</p>
          <div className="flex flex-wrap gap-2">
            {rows.filter(r => r.isAtRisk).map(r => (
              <span key={r.studentId} className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {r.studentName}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain">
          <Table className="min-w-[600px] w-full table-fixed">
            <colgroup>
              <col className="w-1/4" />
              <col className="w-1/4" />
              <col className="w-1/4" />
              <col className="w-1/4" />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-3 text-start text-muted-foreground backdrop-blur sm:px-4">{t('students.nameColumn')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-3 text-end text-muted-foreground backdrop-blur sm:px-4">{t('students.totalLessons')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-3 text-end text-muted-foreground backdrop-blur sm:px-4">{t('students.lastLesson')}</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-3 text-end text-muted-foreground backdrop-blur sm:px-4">{t('students.columnStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.studentId} className="hover:bg-muted/20">
                  <TableCell className="max-w-0 px-3 py-3 text-start font-medium text-foreground sm:px-4">
                    <span className="block truncate" title={r.studentName}>
                      {r.studentName}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-end tabular-nums text-foreground sm:px-4">{r.lessonsLast30Days}</TableCell>
                  <TableCell className="max-w-0 px-3 py-3 text-end text-xs text-muted-foreground sm:px-4">
                    <span className="block truncate" title={formatDate(r.lastLessonAt)}>
                      {formatDate(r.lastLessonAt)}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-end sm:px-4">
                    {r.isAtRisk ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        {t('students.statusAtRisk')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        {t('students.statusActive')}
                      </span>
                    )}
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
