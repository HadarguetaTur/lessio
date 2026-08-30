import { redirect } from 'next/navigation'
import { TriangleAlert, GraduationCap } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getTeacherStudentsReport } from '@/lib/reports/teacherReports'
import { parseReportMonths } from '@/lib/reports/params'
import { PeriodSelector } from '@/components/reports/PeriodSelector'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface Props {
  searchParams: Promise<{ months?: string }>
}

export default async function TeacherStudentsReportPage({ searchParams }: Props) {
  const { userId, orgId, role } = await getSession()
  if (role !== 'teacher') redirect('/dashboard')

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) redirect('/teacher/dashboard')

  const { months: monthsParam } = await searchParams
  const months = parseReportMonths(monthsParam, { defaultValue: 3, maxValue: 12 })

  const [timezone, t] = await Promise.all([
    getOrgTimezone(orgId),
    getTranslations('teacherSelf.reports'),
  ])

  const { rows, atRiskCount } = await getTeacherStudentsReport(
    teacher.id,
    orgId,
    timezone,
    months
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('studentsTitle')}
        subtitle={t('studentsSubtitle', { months })}
        actions={<PeriodSelector current={months} options={[1, 2, 3, 6, 12]} />}
      />

      {/* At-risk alert */}
      {atRiskCount > 0 && (
        <div className="mb-5 flex min-w-0 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="min-w-0 text-sm text-amber-800 break-words">
            {t('atRiskAlert', { count: atRiskCount })}
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t('noStudents')} />
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div
            tabIndex={0}
            role="region"
            aria-label={t('studentsTitle')}
            className="h-full min-h-0 w-full overflow-x-auto overflow-y-auto overscroll-x-contain"
          >
            <Table className="min-w-[480px] w-full">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-muted-foreground backdrop-blur">
                    {t('tableStudent')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">
                    {t('tableLessons')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">
                    {t('tableCompleted')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-end text-muted-foreground backdrop-blur">
                    {t('tableAttendance')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.studentId}
                    className={cn('hover:bg-muted/20', row.atRisk && 'bg-amber-50/60')}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.atRisk && (
                          <TriangleAlert size={13} className="text-amber-500 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-foreground">{row.fullName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 tabular-nums text-end text-muted-foreground">
                      {row.totalLessons}
                    </TableCell>
                    <TableCell className="px-4 py-3 tabular-nums text-end text-emerald-700">
                      {row.completed}
                    </TableCell>
                    <TableCell className="px-4 py-3 tabular-nums text-end">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                          row.totalLessons === 0
                            ? 'border-border text-muted-foreground bg-muted'
                            : row.atRisk
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        )}
                      >
                        {row.totalLessons === 0 ? '—' : `${row.attendanceRate}%`}
                      </span>
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
