import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { OperationalTeacherReport, OwnerTeacherEconomicsReport } from '@/lib/teacher-economics/report'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EconomicsStateBadge } from './EconomicsStateBadge'

type Props =
  | { finance: false; rows: OperationalTeacherReport[]; month: string }
  | { finance: true; rows: OwnerTeacherEconomicsReport[]; month: string }

const HEAD = 'sticky top-0 z-10 bg-muted/95 px-4 text-muted-foreground backdrop-blur whitespace-nowrap'
const NUM = 'px-4 py-3 tabular-nums text-end'

function formatHours(hours: number): string {
  return hours.toFixed(2).replace(/\.?0+$/, '')
}

function formatRate(rate: number | null): string {
  return rate == null ? '—' : `${rate.toFixed(1).replace(/\.0$/, '')}%`
}

/**
 * One table for both the operations report (counts and hours only) and the
 * owner economics report (the same rows plus money). Keeping them together is
 * what guarantees an office manager and the owner are looking at the same
 * counts for the same month.
 */
export async function TeacherActivityTable(props: Props) {
  const [t, locale] = await Promise.all([getTranslations('reports.activityTable'), getLocale()])
  const money = (value: number | null) => (value == null ? '—' : formatMoney(value, locale))

  if (props.rows.length === 0) {
    return <EmptyState icon={ClipboardList} title={t('emptyTitle')} subtitle={t('emptySubtitle')} />
  }

  const totals = props.rows.reduce(
    (acc, row) => {
      acc.completed += row.completedCount
      acc.noShow += row.noShowCount
      acc.cancelled += row.cancelledCount
      acc.scheduled += row.scheduledCount
      acc.hours += row.deliveryHours
      if (props.finance) {
        const owner = row as OwnerTeacherEconomicsReport
        acc.revenue += owner.attributedRevenue
        if (owner.estimatedCompensation != null) acc.compensation += owner.estimatedCompensation
        if (owner.contribution != null) acc.contribution += owner.contribution
        else acc.incomplete = true
      }
      return acc
    },
    { completed: 0, noShow: 0, cancelled: 0, scheduled: 0, hours: 0, revenue: 0, compensation: 0, contribution: 0, incomplete: false }
  )
  const totalRate = totals.revenue > 0 && !totals.incomplete ? Math.round((totals.contribution / totals.revenue) * 1000) / 10 : null

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div tabIndex={0} role="region" aria-label={t('ariaLabel')} className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain">
        <Table className={cn('w-full', props.finance ? 'min-w-[1100px]' : 'min-w-[680px]')}>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={cn(HEAD, 'text-start')}>{t('teacher')}</TableHead>
              <TableHead className={cn(HEAD, 'text-end')}>{t('completed')}</TableHead>
              <TableHead className={cn(HEAD, 'text-end')}>{t('noShow')}</TableHead>
              <TableHead className={cn(HEAD, 'text-end')}>{t('cancelled')}</TableHead>
              <TableHead className={cn(HEAD, 'text-end')}>{t('scheduled')}</TableHead>
              <TableHead className={cn(HEAD, 'text-end')}>{t('hours')}</TableHead>
              {props.finance && (
                <>
                  <TableHead className={cn(HEAD, 'text-end')}>{t('revenue')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-end')}>{t('compensation')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-end')}>{t('contribution')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-end')}>{t('contributionRate')}</TableHead>
                  <TableHead className={cn(HEAD, 'text-start')}>{t('state')}</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.map((row) => {
              const owner = props.finance ? (row as OwnerTeacherEconomicsReport) : null
              return (
                <TableRow key={row.teacherId} className="hover:bg-muted/20">
                  <TableCell className="px-4 py-3 font-medium text-foreground">
                    {owner ? (
                      <Link href={`/reports/economics/${row.teacherId}?month=${props.month}`} className="underline-offset-4 hover:underline">
                        {row.teacherName}
                      </Link>
                    ) : row.teacherName}
                  </TableCell>
                  <TableCell className={NUM}>{row.completedCount}</TableCell>
                  <TableCell className={cn(NUM, row.noShowCount > 0 && 'text-amber-700')}>{row.noShowCount}</TableCell>
                  <TableCell className={cn(NUM, row.cancelledCount > 0 && 'text-red-700')}>{row.cancelledCount}</TableCell>
                  <TableCell className={cn(NUM, 'text-muted-foreground')}>{row.scheduledCount}</TableCell>
                  <TableCell className={NUM}>{formatHours(row.deliveryHours)}</TableCell>
                  {owner && (
                    <>
                      <TableCell className={NUM}>{money(owner.attributedRevenue)}</TableCell>
                      <TableCell className={NUM}>{money(owner.estimatedCompensation)}</TableCell>
                      <TableCell className={cn(NUM, 'font-medium', owner.contribution != null && owner.contribution < 0 && 'text-red-700')}>
                        {money(owner.contribution)}
                      </TableCell>
                      <TableCell className={cn(NUM, 'text-muted-foreground')}>{formatRate(owner.contributionRate)}</TableCell>
                      <TableCell className="px-4 py-3">
                        <EconomicsStateBadge state={owner.confirmationState} attention={owner.attention} />
                      </TableCell>
                    </>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-muted/30 font-semibold hover:bg-muted/30">
              <TableCell className="px-4 py-3">{t('totals', { count: props.rows.length })}</TableCell>
              <TableCell className={NUM}>{totals.completed}</TableCell>
              <TableCell className={NUM}>{totals.noShow}</TableCell>
              <TableCell className={NUM}>{totals.cancelled}</TableCell>
              <TableCell className={cn(NUM, 'text-muted-foreground')}>{totals.scheduled}</TableCell>
              <TableCell className={NUM}>{formatHours(totals.hours)}</TableCell>
              {props.finance && (
                <>
                  <TableCell className={NUM}>{money(totals.revenue)}</TableCell>
                  <TableCell className={NUM}>{totals.incomplete ? t('partial', { amount: money(totals.compensation) }) : money(totals.compensation)}</TableCell>
                  <TableCell className={cn(NUM, totals.contribution < 0 && 'text-red-700')}>
                    {totals.incomplete ? t('partial', { amount: money(totals.contribution) }) : money(totals.contribution)}
                  </TableCell>
                  <TableCell className={cn(NUM, 'text-muted-foreground')}>{formatRate(totalRate)}</TableCell>
                  <TableCell />
                </>
              )}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}
