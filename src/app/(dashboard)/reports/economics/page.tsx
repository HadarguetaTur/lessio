import { redirect } from 'next/navigation'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getOwnerTeacherEconomicsReport } from '@/lib/teacher-economics/report'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decideEconomicsAdjustmentAction, publishMonthlySnapshotAction, reopenMonthlySnapshotAction } from './actions'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { PageHeader } from '@/components/ui/page-header'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function EconomicsReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await getSession()
  if (session.role !== 'owner') redirect('/dashboard')
  const timezone = await getOrgTimezone(session.orgId)
  const requested = (await searchParams).month
  const month = requested && /^\d{4}-\d{2}$/.test(requested)
    ? requested
    : DateTime.now().setZone(timezone).toFormat('yyyy-MM')
  const [rows, locale, t] = await Promise.all([
    getOwnerTeacherEconomicsReport(session.orgId, month, timezone),
    getLocale(),
    getTranslations('reports.economics'),
  ])
  const { data: snapshot } = await createServiceRoleClient()
    .from('teacher_economics_snapshots')
    .select('id, status')
    .eq('organization_id', session.orgId)
    .eq('month', `${month}-01`)
    .maybeSingle()
  const { data: adjustments } = snapshot?.status === 'published'
    ? await createServiceRoleClient().from('teacher_economics_adjustments').select('id, reason, status').eq('organization_id', session.orgId).eq('snapshot_id', (snapshot as { id?: string }).id ?? '').eq('status', 'pending')
    : { data: [] as { id: string; reason: string; status: string }[] }
  const money = (value: number) => formatMoney(value, locale)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        subtitle={t('description')}
        actions={<div className="flex flex-wrap gap-2">
          <CsvDownloadButton report="economics" params={{ month }} />
          {snapshot?.status === 'published' ? (
            <form action={reopenMonthlySnapshotAction}>
              <input type="hidden" name="month" value={month} />
              <button type="submit" className="rounded-md border px-3 py-2 text-sm">{t('reopen')}</button>
            </form>
          ) : (
            <form action={publishMonthlySnapshotAction}>
              <input type="hidden" name="month" value={month} />
              <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">{t('publish')}</button>
            </form>
          )}
        </div>}
      />
      <div className="mb-4 text-sm text-muted-foreground">{t('month')}: {month}</div>
      {(adjustments ?? []).length > 0 && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h2 className="font-semibold">{t('pendingAdjustments')}</h2>
        {(adjustments ?? []).map((adjustment) => <div key={adjustment.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>{adjustment.reason}</span>
          <div className="flex gap-2">
            {(['accepted', 'rejected'] as const).map((decision) => <form key={decision} action={decideEconomicsAdjustmentAction}>
              <input type="hidden" name="adjustmentId" value={adjustment.id} />
              <input type="hidden" name="decision" value={decision} />
              <input type="hidden" name="decisionReason" value={decision === 'accepted' ? t('accepted') : t('rejected')} />
              <button className="rounded border px-2 py-1" type="submit">{t(decision)}</button>
            </form>)}
          </div>
        </div>)}
      </div>}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
        <Table className="min-w-[1100px]">
          <TableHeader><TableRow>
            <TableHead>{t('teacher')}</TableHead><TableHead className="text-end">{t('completed')}</TableHead>
            <TableHead className="text-end">{t('noShow')}</TableHead><TableHead className="text-end">{t('cancelled')}</TableHead>
            <TableHead className="text-end">{t('hours')}</TableHead><TableHead className="text-end">{t('revenue')}</TableHead>
            <TableHead className="text-end">{t('compensation')}</TableHead><TableHead className="text-end">{t('contribution')}</TableHead>
            <TableHead>{t('state')}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((row) => <TableRow key={row.teacherId}>
            <TableCell>{row.teacherName}</TableCell><TableCell className="text-end">{row.completedCount}</TableCell>
            <TableCell className="text-end">{row.noShowCount}</TableCell><TableCell className="text-end">{row.cancelledCount}</TableCell>
            <TableCell className="text-end">{row.deliveryHours.toFixed(2)}</TableCell><TableCell className="text-end">{money(row.attributedRevenue)}</TableCell>
            <TableCell className="text-end">{money(row.estimatedCompensation)}</TableCell><TableCell className="text-end">{money(row.contribution)}</TableCell>
            <TableCell>{t(row.confirmationState === 'missing_policy' ? 'missingPolicy' : row.confirmationState)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
    </div>
  )
}
