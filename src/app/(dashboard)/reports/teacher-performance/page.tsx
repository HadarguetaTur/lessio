import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeacherPerformance } from '@/lib/reports/teacherPerformance'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function TeacherPerformancePage() {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')
  await requireFeature(session.orgId, 'full_reports')

  const timezone = await getOrgTimezone(session.orgId)
  const t = await getTranslations('reports')

  const data = await getTeacherPerformance(session.orgId, timezone, 3)

  return (
    <div className="flex flex-col">
      <PageHeader title={t('teacherPerformance.title')} />

      {data.teachers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('teacherPerformance.noData')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('teacherPerformance.teacher')}</TableHead>
                  <TableHead>{t('teacherPerformance.lessonsDelivered')}</TableHead>
                  <TableHead>{t('teacherPerformance.cancellationRate')}</TableHead>
                  <TableHead>{t('teacherPerformance.noShows')}</TableHead>
                  <TableHead>{t('teacherPerformance.students')}</TableHead>
                  <TableHead>{t('teacherPerformance.avgMonthly')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.teachers.map((teacher) => (
                  <TableRow key={teacher.teacherId}>
                    <TableCell className="font-medium">{teacher.teacherName}</TableCell>
                    <TableCell>{teacher.lessonsDelivered}</TableCell>
                    <TableCell>
                      <span className={teacher.cancellationRate >= 20 ? 'text-red-600 font-medium' : ''}>
                        {teacher.cancellationRate.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell>{teacher.noShowCount}</TableCell>
                    <TableCell>{teacher.studentCount}</TableCell>
                    <TableCell>{teacher.avgMonthlyLessons.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Org averages */}
          <div className="border-t border-border bg-muted/30 px-5 py-3 flex gap-6 text-xs text-muted-foreground">
            <span>{t('teacherPerformance.orgAvgLessons')}: {data.orgAverages.avgLessonsDelivered.toFixed(1)}</span>
            <span>{t('teacherPerformance.orgAvgCancellation')}: {data.orgAverages.avgCancellationRate.toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  )
}
