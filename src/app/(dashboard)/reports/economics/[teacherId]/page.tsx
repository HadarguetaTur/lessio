import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ArrowRight, ClipboardList } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { canViewEconomics } from '@/lib/auth/roles'
import { getOrgTimezone } from '@/lib/organizations'
import { getOwnerTeacherEconomicsReport } from '@/lib/teacher-economics/report'
import type { EstimateLine } from '@/lib/teacher-economics/calculator'
import { describePolicy } from '@/lib/teacher-economics/describePolicy'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { resolveReportMonth } from '@/lib/reports/month'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { ReportMonthNav } from '@/components/reports/ReportMonthNav'
import { EconomicsStateBadge } from '@/components/reports/EconomicsStateBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const HEAD = 'sticky top-0 z-10 bg-muted/95 px-4 text-muted-foreground backdrop-blur whitespace-nowrap'
const NUM = 'px-4 py-3 tabular-nums text-end'

interface Props {
  params: Promise<{ teacherId: string }>
  searchParams: Promise<{ month?: string }>
}

export default async function TeacherEconomicsDetailPage({ params, searchParams }: Props) {
  const session = await getSession()
  if (!canViewEconomics(session.role)) redirect('/dashboard')
  const { teacherId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(teacherId)) notFound()
  const timezone = await getOrgTimezone(session.orgId)
  const { month, currentMonth } = resolveReportMonth((await searchParams).month, timezone)

  const [rows, locale, t, tTable] = await Promise.all([
    getOwnerTeacherEconomicsReport(session.orgId, month, timezone, teacherId),
    getLocale(),
    getTranslations('reports.economics'),
    getTranslations('reports.activityTable'),
  ])
  const row = rows[0]
  const money = (value: number | null) => (value == null ? '—' : formatMoney(value, locale))
  const intlLocale = toIntlLocale(parseAppLocale(locale))
  const isRtl = parseAppLocale(locale) === 'he'
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone })

  const lines: EstimateLine[] = row ? [...row.estimateLines].sort((a, b) => a.startAt.localeCompare(b.startAt)) : []
  const describe = (line: EstimateLine) => describePolicy(line.policySnapshot, (key, values) => t(key, values), (value) => formatMoney(value, locale))
  const outcomeClass: Record<EstimateLine['outcome'], string> = {
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    no_show: 'bg-amber-50 text-amber-700 border-amber-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <Link href={`/reports/economics?month=${month}`} className="mb-3 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        {isRtl ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
        {t('detail.back')}
      </Link>
      <PageHeader
        title={row?.teacherName ?? t('detail.unknownTeacher')}
        subtitle={t('detail.subtitle')}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <ReportMonthNav month={month} currentMonth={currentMonth} />
            <CsvDownloadButton report="economics-lines" params={{ month, teacherId }} />
          </div>
        }
      />

      {row && (
        <div className="mb-6 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t('kpi.revenue')} value={money(row.attributedRevenue)} variant="revenue" />
          <KpiCard label={t('kpi.compensation')} value={money(row.estimatedCompensation)} subLabel={t('kpi.hours', { hours: row.deliveryHours.toFixed(2).replace(/\.?0+$/, '') })} />
          <KpiCard label={t('kpi.contribution')} value={money(row.contribution)} variant={(row.contribution ?? 0) < 0 ? 'warning' : 'default'} subLabel={row.contributionRate == null ? undefined : `${row.contributionRate}%`} />
          <div className="flex flex-col justify-center gap-2 rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">{t('detail.state')}</p>
            <EconomicsStateBadge state={row.confirmationState} attention={row.attention} className="w-fit" />
          </div>
        </div>
      )}

      {lines.length === 0 ? (
        <EmptyState icon={ClipboardList} title={tTable('emptyTitle')} subtitle={tTable('emptySubtitle')} />
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div tabIndex={0} role="region" aria-label={t('detail.subtitle')} className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain">
            <Table className="w-full min-w-[1200px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className={cn(HEAD, 'text-start')}>{t('detail.when')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-start')}>{t('detail.students')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-start')}>{t('detail.outcome')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-end')}>{t('detail.duration')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-start')}>{t('detail.basis')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-start')}>{t('detail.policy')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-end')}>{t('kpi.revenue')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-end')}>{t('kpi.compensation')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-end')}>{t('kpi.contribution')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-start')}>{t('detail.state')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.lessonId} className={cn('hover:bg-muted/20', line.outcome === 'scheduled' && 'text-muted-foreground')}>
                    <TableCell className="whitespace-nowrap px-4 py-3">
                      <Link href={`/lessons/${line.lessonId}`} className="underline-offset-4 hover:underline">{dateFormat.format(new Date(line.startAt))}</Link>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span>{line.studentNames.join(', ') || '—'}</span>
                      <span className="ms-1 text-xs text-muted-foreground">({t(`lessonType.${line.lessonType}`)})</span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className={cn('inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium', outcomeClass[line.outcome])}>
                        {t(`outcome.${line.outcome}`)}
                      </span>
                      {line.outcome === 'cancelled' && line.cancellationActor && (
                        <span className="ms-1 text-xs text-muted-foreground">{t(`actor.${line.cancellationActor}`)}</span>
                      )}
                    </TableCell>
                    <TableCell className={NUM}>{line.durationHours.toFixed(2).replace(/\.?0+$/, '')}</TableCell>
                    <TableCell className="px-4 py-3 text-xs">
                      <span>{t(`basis.${line.revenueBasis}`)}</span>
                      {line.subscriptionCovered && <span className="ms-1 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{t('basis.subscriptionCovered')}</span>}
                      {line.packCovered && <span className="ms-1 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{t('basis.packCovered')}</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs">{describe(line)}</TableCell>
                    <TableCell className={NUM}>{money(line.attributedRevenue)}</TableCell>
                    <TableCell className={NUM}>{money(line.estimatedCompensation)}</TableCell>
                    <TableCell className={cn(NUM, 'font-medium', line.contribution != null && line.contribution < 0 && 'text-red-700')}>{money(line.contribution)}</TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {line.outcome !== 'scheduled' && <EconomicsStateBadge state={line.confirmationState} className="w-fit" />}
                        {line.warnings.map((warning) => (
                          <span key={warning} className="text-xs text-muted-foreground">{t(`warnings.${warning}`)}</span>
                        ))}
                      </div>
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
