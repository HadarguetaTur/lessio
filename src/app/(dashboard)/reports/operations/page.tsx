import { redirect } from 'next/navigation'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getOperationalTeacherReport } from '@/lib/teacher-economics/report'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function OperationsReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'office_manager') redirect('/dashboard')
  const timezone = await getOrgTimezone(session.orgId)
  const requested = (await searchParams).month
  const month = requested && /^\d{4}-\d{2}$/.test(requested)
    ? requested
    : DateTime.now().setZone(timezone).toFormat('yyyy-MM')
  const [rows, t] = await Promise.all([
    getOperationalTeacherReport(session.orgId, month, timezone),
    getTranslations('reports.operations'),
  ])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader title={t('title')} subtitle={t('description')} />
      <div className="mb-4 text-sm text-muted-foreground">{t('month')}: {month}</div>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
        <Table className="min-w-[720px]">
          <TableHeader><TableRow>
            <TableHead>{t('teacher')}</TableHead><TableHead className="text-end">{t('completed')}</TableHead>
            <TableHead className="text-end">{t('noShow')}</TableHead><TableHead className="text-end">{t('cancelled')}</TableHead>
            <TableHead className="text-end">{t('scheduled')}</TableHead><TableHead className="text-end">{t('hours')}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((row) => <TableRow key={row.teacherId}>
            <TableCell>{row.teacherName}</TableCell><TableCell className="text-end">{row.completedCount}</TableCell>
            <TableCell className="text-end">{row.noShowCount}</TableCell><TableCell className="text-end">{row.cancelledCount}</TableCell>
            <TableCell className="text-end">{row.scheduledCount}</TableCell><TableCell className="text-end">{row.deliveryHours.toFixed(2)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
    </div>
  )
}
