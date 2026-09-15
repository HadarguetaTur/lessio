import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, Clock, Percent, Scale, Wallet } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { canPublishEconomics, canViewEconomics } from '@/lib/auth/roles'
import { getOrgTimezone } from '@/lib/organizations'
import { getOwnerTeacherEconomicsReport } from '@/lib/teacher-economics/report'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { resolveReportMonth } from '@/lib/reports/month'
import { PageHeader } from '@/components/ui/page-header'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { ReportMonthNav } from '@/components/reports/ReportMonthNav'
import { TeacherActivityTable } from '@/components/reports/TeacherActivityTable'
import { decideEconomicsAdjustmentAction, publishMonthlySnapshotAction, reopenMonthlySnapshotAction } from './actions'
import { PublishSnapshotButton } from './PublishSnapshotButton'

export default async function EconomicsReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await getSession()
  if (!canViewEconomics(session.role)) redirect('/dashboard')
  const timezone = await getOrgTimezone(session.orgId)
  const { month, currentMonth } = resolveReportMonth((await searchParams).month, timezone)
  const db = createServiceRoleClient()

  const [rows, locale, t, snapshotResult, policyCountResult] = await Promise.all([
    getOwnerTeacherEconomicsReport(session.orgId, month, timezone),
    getLocale(),
    getTranslations('reports.economics'),
    db.from('teacher_economics_snapshots')
      .select('id, status, published_at, published_by_profile_id')
      .eq('organization_id', session.orgId)
      .eq('month', `${month}-01`)
      .maybeSingle(),
    db.from('compensation_policies').select('id', { count: 'exact', head: true }).eq('organization_id', session.orgId),
  ])
  const snapshot = snapshotResult.data as { id: string; status: string; published_at: string | null; published_by_profile_id: string | null } | null
  const published = snapshot?.status === 'published'
  const { data: publisher } = published && snapshot?.published_by_profile_id
    ? await db.from('profiles').select('full_name').eq('id', snapshot.published_by_profile_id).maybeSingle()
    : { data: null as { full_name: string } | null }
  const { data: adjustments } = published && snapshot
    ? await db.from('teacher_economics_adjustments').select('id, reason, status').eq('organization_id', session.orgId).eq('snapshot_id', snapshot.id).eq('status', 'pending')
    : { data: [] as { id: string; reason: string; status: string }[] }

  const money = (value: number | null) => (value == null ? '—' : formatMoney(value, locale))
  const hasPolicies = (policyCountResult.count ?? 0) > 0

  const totals = rows.reduce(
    (acc, row) => {
      acc.revenue += row.attributedRevenue
      acc.hours += row.deliveryHours
      if (row.estimatedCompensation != null) acc.compensation += row.estimatedCompensation
      if (row.contribution != null) acc.contribution += row.contribution
      else acc.incomplete = true
      acc.attention.missingPolicy += row.attention.missingPolicy
      acc.attention.awaitingConfirmation += row.attention.awaitingConfirmation
      acc.attention.unknownCancellation += row.attention.unknownCancellation
      acc.attention.staffCancellation += row.attention.staffCancellation
      acc.attention.missingPrice += row.attention.missingPrice
      acc.attention.noStudents += row.attention.noStudents
      return acc
    },
    { revenue: 0, compensation: 0, contribution: 0, hours: 0, incomplete: false, attention: { missingPolicy: 0, awaitingConfirmation: 0, unknownCancellation: 0, staffCancellation: 0, missingPrice: 0, noStudents: 0 } }
  )
  const rate = totals.revenue > 0 && !totals.incomplete ? Math.round((totals.contribution / totals.revenue) * 1000) / 10 : null
  const attentionItems: { key: string; count: number; href?: string }[] = [
    { key: 'missingPolicy', count: totals.attention.missingPolicy, href: '/settings/teacher-economics' },
    { key: 'awaitingConfirmation', count: totals.attention.awaitingConfirmation },
    { key: 'unknownCancellation', count: totals.attention.unknownCancellation },
    { key: 'staffCancellation', count: totals.attention.staffCancellation },
    { key: 'missingPrice', count: totals.attention.missingPrice, href: '/settings/pricing' },
    { key: 'noStudents', count: totals.attention.noStudents },
  ].filter((item) => item.count > 0)

  const publishedAt = snapshot?.published_at
    ? new Intl.DateTimeFormat(toIntlLocale(parseAppLocale(locale)), { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(snapshot.published_at))
    : null

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        subtitle={t('description')}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <ReportMonthNav month={month} currentMonth={currentMonth} />
            <CsvDownloadButton report="economics" params={{ month }} />
            {canPublishEconomics(session.role) && (
              <PublishSnapshotButton month={month} mode={published ? 'reopen' : 'publish'} action={published ? reopenMonthlySnapshotAction : publishMonthlySnapshotAction} />
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {published ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {t('snapshot.published', { date: publishedAt ?? '', name: publisher?.full_name ?? '' })}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t('snapshot.draft')}</span>
        )}
        <span className="text-muted-foreground">{t('snapshot.hint')}</span>
      </div>

      {(attentionItems.length > 0 || (adjustments ?? []).length > 0) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle size={16} />
            {t('attention.title')}
          </div>
          <ul className="mt-2 space-y-1 text-amber-900">
            {attentionItems.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-2">
                <span>{t(`attention.${item.key}`, { count: item.count })}</span>
                {item.href && <Link href={item.href} className="font-medium underline underline-offset-2">{t(`attention.${item.key}Action`)}</Link>}
              </li>
            ))}
            {(adjustments ?? []).map((adjustment) => (
              <li key={adjustment.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>{t('pendingAdjustment')}: {adjustment.reason}</span>
                <div className="flex gap-2">
                  {(['accepted', 'rejected'] as const).map((decision) => (
                    <form key={decision} action={decideEconomicsAdjustmentAction}>
                      <input type="hidden" name="adjustmentId" value={adjustment.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <input type="hidden" name="decisionReason" value={t(decision)} />
                      <button className="rounded border border-amber-300 bg-white px-2 py-1 text-xs" type="submit">{t(decision)}</button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasPolicies && rows.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold">{t('noPolicies.title')}</p>
          <p className="mt-1 text-muted-foreground">{t('noPolicies.body')}</p>
          <Link href="/settings/teacher-economics" className="mt-2 inline-block font-medium text-primary underline underline-offset-2">{t('noPolicies.action')}</Link>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-6 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t('kpi.revenue')} value={money(totals.revenue)} icon={Wallet} variant="revenue" subLabel={t('kpi.revenueHint')} />
          <KpiCard label={t('kpi.compensation')} value={totals.incomplete ? t('kpi.partial', { amount: money(totals.compensation) }) : money(totals.compensation)} icon={Scale} subLabel={t('kpi.hours', { hours: totals.hours.toFixed(2).replace(/\.?0+$/, '') })} />
          <KpiCard
            label={t('kpi.contribution')}
            value={totals.incomplete ? t('kpi.partial', { amount: money(totals.contribution) }) : money(totals.contribution)}
            icon={Clock}
            variant={totals.contribution < 0 ? 'warning' : 'default'}
            subLabel={t('kpi.contributionHint')}
          />
          <KpiCard label={t('kpi.rate')} value={rate == null ? '—' : `${rate}%`} icon={Percent} subLabel={t('kpi.rateHint')} />
        </div>
      )}

      <TeacherActivityTable finance rows={rows} month={month} />
    </div>
  )
}
