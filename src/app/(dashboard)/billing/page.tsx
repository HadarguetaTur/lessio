import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import {
  formatBillingMonthLabel,
  getBillingMonthSelectOptionValues,
  getCurrentBillingMonth,
} from '@/lib/billing/monthly/month'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { getLocale } from 'next-intl/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'
import { BillingRecordsMobileList } from '@/components/dashboard/billing/BillingRecordsMobileList'
import { getTranslations } from 'next-intl/server'
import { GenerateBillingButton } from './GenerateBillingButton'
import { MarkPaidButton } from './MarkPaidButton'
import { ApproveBillingButton } from './ApproveBillingButton'

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
  const [timezone, t, tCommon, locale] = await Promise.all([
    getOrgTimezone(orgId),
    getTranslations('billing'),
    getTranslations('common'),
    getLocale(),
  ])

  const billingMonth = searchParams.month || getCurrentBillingMonth(timezone)
  const intlLocale = toIntlLocale(parseAppLocale(locale))
  const money = (amount: number) => formatMoney(amount, locale)
  const billingMonthOptions = getBillingMonthSelectOptionValues(timezone, billingMonth)
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
    invoice_number: string | null
    credit_note_number: string | null
    students: { id: string; full_name: string } | null
  }>

  const totalBilled = records.reduce((s, r) => s + Number(r.total_amount), 0)
  const totalPaid = records.filter((r) => r.is_paid).reduce((s, r) => s + Number(r.total_amount), 0)
  const pendingApproval = records.filter((r) => !r.is_approved && !r.is_paid).length

  return (
    <div className="flex w-full min-h-0 flex-col md:h-full md:overflow-hidden">
      <PageHeader
        title={t('title')}
        mobileCentered
        actions={
          isOwnerOrAdmin ? (
            <GenerateBillingButton billingMonth={billingMonth} />
          ) : undefined
        }
      />

      <form
        method="GET"
        className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end"
      >
        <div className="w-full min-w-0 sm:flex-1">
          <label
            htmlFor="billing-month-select"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {t('monthLabel')}
          </label>
          <select
            id="billing-month-select"
            name="month"
            defaultValue={billingMonth}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
          >
            {billingMonthOptions.map((ym) => (
              <option key={ym} value={ym}>
                {formatBillingMonthLabel(ym, timezone, intlLocale)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
        >
          {locale === 'he' ? 'הצג חודש' : 'Show month'}
        </button>
      </form>

      {records.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-4 sm:gap-6">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('summary.totalBilled')}
            </p>
            <p className="text-lg font-bold text-foreground">{money(totalBilled)}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('summary.totalPaid')}
            </p>
            <p className="text-lg font-bold text-emerald-700">{money(totalPaid)}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('summary.totalPending')}
            </p>
            <p className="text-lg font-bold text-amber-600">{pendingApproval}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('summary.studentsProcessed')}
            </p>
            <p className="text-lg font-bold text-foreground">{records.length}</p>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <EmptyState icon={Receipt} title={t('noBillingRecords')} />
      ) : (
        <>
          <BillingRecordsMobileList
            records={records}
            billingMonth={billingMonth}
            isOwnerOrAdmin={isOwnerOrAdmin}
            locale={locale}
            labels={{
              lessons: t('table.lessons'),
              subscriptions: t('table.subscriptions'),
              cancellations: t('table.cancellations'),
              adjustment: t('table.adjustment'),
              total: t('table.total'),
              paid: t('status.paid'),
              edit: tCommon('actions.edit'),
            }}
          />
          <div className="hidden min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm md:flex md:flex-col">
            <div className="min-h-0 flex-1 overflow-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
              <table className="min-w-[900px] w-full">
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
                    <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                      {t('invoice.number')}
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
                          {money(Number(record.lessons_amount))}
                          <span className="mr-1 text-xs text-muted-foreground">
                            ({record.lessons_count})
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm text-foreground" dir="ltr">
                          {money(Number(record.subscriptions_amount))}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm text-foreground" dir="ltr">
                          {money(Number(record.cancellations_amount))}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm" dir="ltr">
                          {record.manual_adjustment_amount != null ? (
                            <span
                              className={
                                Number(record.manual_adjustment_amount) < 0
                                  ? 'text-red-600'
                                  : 'text-foreground'
                              }
                            >
                              {money(Number(record.manual_adjustment_amount))}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm font-semibold text-foreground" dir="ltr">
                          {money(Number(record.total_amount))}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={status} />
                        </td>
                        <td className="px-5 py-3.5">
                          {record.invoice_number ? (
                            <span className="text-xs font-mono text-foreground">{record.invoice_number}</span>
                          ) : null}
                          {record.credit_note_number ? (
                            <span className="ms-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                              {t('creditNote.cancelled')}
                            </span>
                          ) : null}
                        </td>
                        {isOwnerOrAdmin && (
                          <td className="px-5 py-3.5">
                            {record.is_paid ? (
                              <span className="text-xs text-muted-foreground">
                                {t('status.paid')}
                              </span>
                            ) : !record.is_approved ? (
                              <ApproveBillingButton billingId={record.id} />
                            ) : (
                              <MarkPaidButton billingId={record.id} />
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
        </>
      )}
    </div>
  )
}
