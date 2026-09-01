import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { formatBillingMonthLabel } from '@/lib/billing/monthly/month'
import { getOrgTimezone } from '@/lib/organizations'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PortalTabBar } from '@/components/portal/PortalTabBar'

/**
 * Portal payments — pending charges with payment links + payment history.
 * Per /docs/sprint-13-scope.md § Story 7.
 */
export default async function PortalPaymentsPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  const [t, locale, timezone] = await Promise.all([
    getTranslations('portal.payments'),
    getLocale(),
    getOrgTimezone(orgId),
  ])
  const appLocale = parseAppLocale(locale)
  const intlLocale = toIntlLocale(appLocale)

  const db = createServiceRoleClient()

  // Named in the "no payment link" copy — an open charge the parent cannot act
  // on has to at least say who to ask about it.
  const { data: org } = await db
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()
  const orgName = (org?.name as string | null) ?? ''

  const { data: charges } = await db
    .from('charges')
    .select(
      'id, amount, amount_paid, status, charge_type, payment_link, receipt_url, created_at, paid_at, due_date, billing_month, student_monthly_billing(period_start, period_end)'
    )
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  type ChargeRow = {
    id: string
    amount: number
    amount_paid: number | null
    status: string
    charge_type: string
    payment_link: string | null
    receipt_url: string | null
    created_at: string
    paid_at: string | null
    due_date: string | null
    billing_month: string | null
    student_monthly_billing?: { period_start: string | null; period_end: string | null } | null
  }
  const rows = (charges ?? []) as unknown as ChargeRow[]

  const open = rows.filter((c) => c.status === 'pending' || c.status === 'invoiced')
  // `waived` and `voided` are settled outcomes, not open charges. They used to
  // match neither filter and vanished from the screen entirely, so a parent
  // whose charge had been written off saw no record it ever existed.
  const settled = rows.filter((c) => ['paid', 'waived', 'voided'].includes(c.status)).slice(0, 20)

  function formatAmount(amount: number) {
    return formatCurrency(Number(amount), appLocale, 2)
  }

  /** What is still owed on an open charge, after any partial payment. */
  function remaining(charge: { amount: number; amount_paid?: number | null }) {
    return Math.max(0, Number(charge.amount) - Number(charge.amount_paid ?? 0))
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(intlLocale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  /** Today in the org's timezone, as 'YYYY-MM-DD', to compare against a date column. */
  const todayLocal = new Date().toLocaleDateString('sv-SE', { timeZone: timezone })
  const isOverdue = (c: ChargeRow) => c.due_date != null && c.due_date < todayLocal
  const daysLate = (c: ChargeRow) =>
    c.due_date == null
      ? 0
      : Math.max(
          0,
          Math.round(
            (new Date(`${todayLocal}T00:00:00Z`).getTime() - new Date(`${c.due_date}T00:00:00Z`).getTime()) /
              86_400_000
          )
        )

  // next-intl throws on missing keys — guard unknown values with the raw string.
  const KNOWN_CHARGE_TYPES = new Set(['lesson', 'cancellation', 'manual', 'monthly'])
  const chargeTypeLabel = (type: string) =>
    KNOWN_CHARGE_TYPES.has(type) ? t(`chargeType.${type}`) : type
  const KNOWN_SETTLED = new Set(['paid', 'waived', 'voided'])
  const settledLabel = (status: string) => (KNOWN_SETTLED.has(status) ? t(status) : status)

  /**
   * What the charge is for. A monthly bill says which month; everything else
   * falls back to its type. Two rows reading "Monthly · 05.08.2026" with
   * different amounts were impossible to tell apart.
   */
  function describe(c: ChargeRow) {
    const period = c.student_monthly_billing
    if (c.charge_type === 'monthly' && period?.period_start && period.period_end) {
      return t('forPeriod', {
        start: formatDate(period.period_start),
        end: formatDate(period.period_end),
      })
    }
    if (c.charge_type === 'monthly' && c.billing_month) {
      return t('forMonth', { month: formatBillingMonthLabel(c.billing_month, timezone, intlLocale) })
    }
    return chargeTypeLabel(c.charge_type)
  }

  return (
    <div className="flex flex-col flex-1 pb-16">
      {/* This screen is not in the tab bar, so it needs its own way back. */}
      <header className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <Link
          href={`/portal/${orgId}/home`}
          aria-label={t('back')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} className="rtl:rotate-180" aria-hidden />
        </Link>
        <h1 className="font-bold text-gray-900">{t('title')}</h1>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Open charges */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('pendingTitle')}</h2>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noOpenCharges')}</p>
          ) : (
            <div className="space-y-2">
              {open.map((c) => (
                <div
                  key={c.id}
                  className={`bg-white border rounded-lg p-3 flex justify-between items-start gap-3 ${
                    isOverdue(c) ? 'border-red-300 bg-red-50/40' : 'border-gray-200'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatAmount(remaining(c))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {describe(c)}
                      {c.due_date && <> · {t('dueOn', { date: formatDate(c.due_date) })}</>}
                    </p>
                    {/* An overdue charge used to look calmer than a paid one:
                        neutral grey next to green. */}
                    {isOverdue(c) && (
                      <p className="text-xs font-medium text-red-700 mt-0.5">
                        {t('overdueBy', { days: daysLate(c) })}
                      </p>
                    )}
                    {Number(c.amount_paid ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t('partiallyPaid', {
                          paid: formatAmount(Number(c.amount_paid)),
                          total: formatAmount(Number(c.amount)),
                        })}
                      </p>
                    )}
                  </div>
                  {c.payment_link ? (
                    <a
                      href={c.payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      {t('pay')}
                    </a>
                  ) : (
                    /* No link means the business has not sent a payment
                       request for this charge yet. Rendering only "pending"
                       left the parent on a screen the home page had promised
                       they could pay on, with nothing to press and nobody to
                       ask. */
                    <div className="text-end shrink-0 max-w-[55%]">
                      <p className="text-xs font-medium text-muted-foreground">{t('pending')}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {t('noPaymentLink', { org: orgName })}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Payment history */}
        {settled.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('historyTitle')}</h2>
            <div className="space-y-2">
              {settled.map((c) => (
                <div key={c.id} className="bg-white border border-gray-100 rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-700">{formatAmount(c.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {describe(c)} · {c.paid_at ? formatDate(c.paid_at) : formatDate(c.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium ${
                        c.status === 'paid' ? 'text-green-700' : 'text-muted-foreground'
                      }`}
                    >
                      {settledLabel(c.status)}
                    </span>
                    {c.status === 'paid' && c.receipt_url && (
                      <a
                        href={c.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        {t('receipt')}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <PortalTabBar orgId={orgId} active="payments" />
    </div>
  )
}
