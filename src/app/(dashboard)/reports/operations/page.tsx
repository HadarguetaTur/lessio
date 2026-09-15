import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canManageOperations } from '@/lib/auth/roles'
import { getOrgTimezone } from '@/lib/organizations'
import { getOperationalTeacherReport } from '@/lib/teacher-economics/report'
import { resolveReportMonth } from '@/lib/reports/month'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import { ReportMonthNav } from '@/components/reports/ReportMonthNav'
import { TeacherActivityTable } from '@/components/reports/TeacherActivityTable'

/**
 * The operations report: the same per-teacher counts and hours the owner sees
 * on the economics report, without the money columns. Safe for office managers.
 */
export default async function OperationsReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await getSession()
  if (!canManageOperations(session.role)) redirect('/dashboard')
  const timezone = await getOrgTimezone(session.orgId)
  const { month, currentMonth } = resolveReportMonth((await searchParams).month, timezone)
  const [rows, t] = await Promise.all([
    getOperationalTeacherReport(session.orgId, month, timezone),
    getTranslations('reports.operations'),
  ])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader title={t('title')} subtitle={t('description')} actions={<ReportMonthNav month={month} currentMonth={currentMonth} />} />
      <TeacherActivityTable finance={false} rows={rows} month={month} />
    </div>
  )
}
