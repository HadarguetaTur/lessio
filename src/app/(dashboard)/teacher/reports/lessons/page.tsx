import { redirect } from 'next/navigation'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getTeacherLessonsReport } from '@/lib/reports/teacherReports'
import { getTeacherPersonalEstimate } from '@/lib/teacher-economics/report'
import { parseReportMonths } from '@/lib/reports/params'
import { TeacherLessonsChart } from '@/components/reports/lazyCharts'
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

interface Props {
  searchParams: Promise<{ months?: string }>
}

export default async function TeacherLessonsReportPage({ searchParams }: Props) {
  const { userId, orgId, role } = await getSession()
  if (role !== 'teacher') redirect('/dashboard')

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) redirect('/teacher/dashboard')

  const { months: monthsParam } = await searchParams
  const months = parseReportMonths(monthsParam, { defaultValue: 12, maxValue: 24 })

  const [timezone, locale, t] = await Promise.all([
    getOrgTimezone(orgId),
    getLocale(),
    getTranslations('teacherSelf.reports'),
  ])
  const personalEstimate = await getTeacherPersonalEstimate(
    orgId,
    teacher.id,
    DateTime.now().setZone(timezone).toFormat('yyyy-MM'),
    timezone
  )

  const appLocale = parseAppLocale(locale)
  const { buckets, totalCompleted, totalCancelled, totalNoShow } =
    await getTeacherLessonsReport(teacher.id, orgId, timezone, months, appLocale)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('lessonsTitle')}
        subtitle={t('lessonsSubtitle', { completed: totalCompleted, cancelled: totalCancelled, noShow: totalNoShow })}
        actions={<PeriodSelector current={months} />}
      />

      {personalEstimate && (
        <div className="mb-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t('personalEstimateTitle')}</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><div className="text-muted-foreground">{t('estimatedCompensation')}</div><div className="font-semibold">{personalEstimate.estimatedCompensation.toFixed(2)}</div></div>
            <div><div className="text-muted-foreground">{t('deliveryHours')}</div><div className="font-semibold">{personalEstimate.deliveryHours.toFixed(2)}</div></div>
            <div><div className="text-muted-foreground">{t('completedCount')}</div><div className="font-semibold">{personalEstimate.completedCount}</div></div>
            <div><div className="text-muted-foreground">{t('estimateState')}</div><div className="font-semibold">{t(personalEstimate.confirmationState)}</div></div>
          </div>
        </div>
      )}

      <div className="mb-6 min-w-0 rounded-xl border border-border bg-card p-6">
        <TeacherLessonsChart buckets={buckets} />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
            tabIndex={0}
            role="region"
            aria-label={t('lessonsTitle')}
            className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain"
          >
          <Table className="min-w-[520px] w-full">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-muted-foreground backdrop-blur">
                  {t('tableMonth')}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">
                  {t('tableCompleted')}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">
                  {t('tableCancelled')}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">
                  {t('tableNoShow')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...buckets].reverse().map((b) => (
                <TableRow key={b.month} className="hover:bg-muted/20">
                  <TableCell className="px-4 py-3 text-foreground">{b.label}</TableCell>
                  <TableCell className="px-4 py-3 font-medium tabular-nums text-emerald-700 text-end">
                    {b.completed}
                  </TableCell>
                  <TableCell className="px-4 py-3 tabular-nums text-destructive text-end">
                    {b.cancelled}
                  </TableCell>
                  <TableCell className="px-4 py-3 tabular-nums text-amber-600 text-end">
                    {b.noShow}
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
