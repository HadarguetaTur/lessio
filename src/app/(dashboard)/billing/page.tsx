import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getCurrentBillingMonth } from '@/lib/billing/monthly/month'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'
import { getTranslations } from 'next-intl/server'
import { GenerateBillingButton } from './GenerateBillingButton'
import { MarkPaidButton } from './MarkPaidButton'

function getBillingStatus(row: { is_paid: boolean; is_approved: boolean }): string {
  if (row.is_paid) return 'paid'
  if (!row.is_approved) return 'pending_approval'
  return 'approved'
}

export default async function BillingPage(props: {
  searchParams: Promise<{ month?: string }>
}) {
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()
  const [timezone, t, tCommon] = await Promise.all([
    getOrgTimezone(orgId),
    getTranslations('billing'),
    getTranslations('common'),
  ])

  const billingMonth = searchParams.month || getCurrentBillingMonth(timezone)
  const isOwnerOrAdmin = role === 'owner' || role === 'admin'

  const supabase = createServiceRoleClient()

  const { data: billingRecords } = await supabase
    .from('student_monthly_billing')
    .select('*, students(id, full_name)')
    .eq('organization_id', orgId)
    .eq('billing_month', billingMonth)
    .order('total_amount', { ascending: false })

  const records = (billingRecords ?? []) as Array<{
    id: string
    student_id: string
    billing_month: string
    is_paid: boolean
    is_approved: boolean
    lessons_amount: number
    subscriptions_amount: number
    cancellations_amount: number
    total_amount: number
    lessons_count: number
    manual_adjustment_amount: number | null
    students: { id: string; full_name: string } | null
  }>

  const totalBilled = records.reduce((s, r) => s + Number(r.total_amount), 0)
  const totalPaid = records.filter((r) => r.is_paid).reduce((s, r) => s + Number(r.total_amount), 0)
  const pendingApproval = records.filter((r) => !r.is_approved && !r.is_paid).length

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        actions={
          isOwnerOrAdmin ? (
            <GenerateBillingButton billingMonth={billingMonth} />
          ) : undefined
        }
      />

      {/* Month selector */}
      <form method="GET" className="bg-card rounded-xl border border-border p-4 mb-5 flex items-end gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
            {t('monthLabel')}
          </label>
          <input
            name="month"
            type="month"
            defaultValue={billingMonth}
            className="border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          {tCommon('actions.search')}
        </button>
      </form>

      {/* Summary cards */}
      {records.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 mb-5 grid grid-cols-4 gap-6">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('summary.totalBilled')}
            </p>
            <p className="text-lg font-bold text-foreground">₪{totalBilled.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('summary.totalPaid')}
            </p>
            <p className="text-lg font-bold text-emerald-600">₪{totalPaid.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('summary.totalPending')}
            </p>
            <p className="text-lg font-bold text-amber-600">{pendingApproval}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {t('summary.studentsProcessed')}
            </p>
            <p className="text-lg font-bold text-foreground">{records.length}</p>
          </div>
        </div>
      )}

      {/* Billing table */}
      {records.length === 0 ? (
        <EmptyState icon={Receipt} title={t('noBillingRecords')} />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-full overflow-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('table.student')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('table.lessons')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('table.subscriptions')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('table.cancellations')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('table.adjustment')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('table.total')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('table.status')}
                  </th>
                {isOwnerOrAdmin && (
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.actions')}
                  </th>
                )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => {
                  const status = getBillingStatus(record)
                  const studentName = record.students?.full_name ?? '—'
                  return (
                    <tr key={record.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={studentName} />
                          <div>
                            <p className="text-sm font-medium text-foreground">{studentName}</p>
                            <Link
                              href={`/billing/${record.student_id}?month=${billingMonth}`}
                              className="text-xs text-primary hover:underline"
                            >
                              {tCommon('actions.edit')} ↗
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm text-foreground" dir="ltr">
                        ₪{Number(record.lessons_amount).toFixed(2)}
                        <span className="mr-1 text-xs text-muted-foreground">
                          ({record.lessons_count})
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm text-foreground" dir="ltr">
                        ₪{Number(record.subscriptions_amount).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm text-foreground" dir="ltr">
                        ₪{Number(record.cancellations_amount).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-mono" dir="ltr">
                        {record.manual_adjustment_amount != null ? (
                          <span className={Number(record.manual_adjustment_amount) < 0 ? 'text-red-600' : 'text-foreground'}>
                            ₪{Number(record.manual_adjustment_amount).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm font-semibold text-foreground" dir="ltr">
                        ₪{Number(record.total_amount).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={status} />
                      </td>
                      {isOwnerOrAdmin && (
                        <td className="px-5 py-3.5">
                          {!record.is_paid ? (
                            <MarkPaidButton billingId={record.id} />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t('status.paid')}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
