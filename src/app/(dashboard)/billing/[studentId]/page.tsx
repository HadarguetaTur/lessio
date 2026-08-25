import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  formatBillingMonthLabel,
  getBillingMonthRange,
  getCurrentBillingMonth,
} from '@/lib/billing/monthly/month'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { getLocale } from 'next-intl/server'
import { getStudentById } from '@/lib/students'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { getTranslations } from 'next-intl/server'
import { BillingDetailHeaderActions } from './BillingDetailHeaderActions'
import { ManualAdjustmentForm } from './ManualAdjustmentForm'
import { CancellationEventRow } from './CancellationEventRow'
import { CancellationEventCard } from './CancellationEventCard'

function getBillingStatus(row: { is_paid: boolean; is_approved: boolean }): string {
  if (row.is_paid) return 'paid'
  if (!row.is_approved) return 'pending_approval'
  return 'approved'
}

export default async function BillingDetailPage(props: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { studentId } = await props.params
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()
  const [timezone, t, tBilling, tLessons, tSubs, locale] = await Promise.all([
    getOrgTimezone(orgId),
    getTranslations('billing.detail'),
    getTranslations('billing'),
    getTranslations('lessons'),
    getTranslations('subscriptions'),
    getLocale(),
  ])

  const billingMonth = searchParams.month || getCurrentBillingMonth(timezone)
  const intlLocale = toIntlLocale(parseAppLocale(locale))
  const billingMonthLabel = formatBillingMonthLabel(billingMonth, timezone, intlLocale)
  const isOwnerOrAdmin = role === 'owner' || role === 'admin'

  // The DB enums leaked to screen as "individual" / "monthly".
  const LESSON_TYPE_KEYS: Record<string, string> = {
    individual: 'typeIndividual',
    pair: 'typePair',
    group: 'typeGroup',
    custom: 'typeCustom',
  }
  const lessonTypeLabel = (value: string) =>
    tLessons(LESSON_TYPE_KEYS[value] ?? 'typeIndividual')
  const subscriptionTypeLabel = (value: string | null) => {
    if (!value) return '—'
    const known = ['monthly', 'weekly', 'per_lesson']
    return known.includes(value) ? tSubs(`types.${value}`) : value
  }
  const formatDateOnly = (isoDate: string) =>
    new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(intlLocale, { timeZone: timezone })

  const [student, supabase] = await Promise.all([
    getStudentById(studentId, orgId),
    Promise.resolve(createServiceRoleClient()),
  ])

  if (!student) notFound()

  // Fetch billing record
  const { data: billingData } = await supabase
    .from('student_monthly_billing')
    .select('*')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .eq('billing_month', billingMonth)
    .maybeSingle()

  // Calculate month boundaries in UTC
  const { monthStartUTC, monthEndUTC } = getBillingMonthRange(
    billingMonth,
    timezone
  )

  const { data: lessonsData } = await supabase
    .from('lessons')
    .select(
      'id, start_at, end_at, status, lesson_type, price_per_student, teachers(profiles(full_name)), lesson_students!inner(student_id)'
    )
    .eq('organization_id', orgId)
    .eq('lesson_students.student_id', studentId)
    .gte('start_at', monthStartUTC)
    .lt('start_at', monthEndUTC)
    .order('start_at', { ascending: true })

  // Fetch cancellation events
  const { data: cancellationData } = await supabase
    .from('student_cancellation_events')
    .select('id, lesson_id, cancellation_date, hours_before, is_lt_24h, is_charged, charge_override, billing_month')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .eq('billing_month', billingMonth)

  // Fetch active subscriptions
  const { data: subsData } = await supabase
    .from('subscriptions')
    .select('id, subscription_type, monthly_amount, start_date, end_date, is_paused')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lessons = (lessonsData ?? []).map((l: any) => ({
    id: l.id as string,
    start_at: l.start_at as string,
    end_at: l.end_at as string,
    status: l.status as string,
    lesson_type: l.lesson_type as string,
    teacher_name: (l.teachers as { profiles: { full_name: string } })?.profiles?.full_name ?? '—',
    price_per_student: l.price_per_student as number | null,
  }))

  const cancellations = (cancellationData ?? []) as Array<{
    id: string
    lesson_id: string
    cancellation_date: string
    hours_before: number
    is_lt_24h: boolean
    is_charged: boolean
    charge_override: number | null
    billing_month: string
  }>

  const subscriptions = (subsData ?? []) as Array<{
    id: string
    subscription_type: string | null
    monthly_amount: number
    start_date: string
    end_date: string | null
    is_paused: boolean
  }>

  const status = billingData ? getBillingStatus(billingData) : null

  return (
    <div>
      <PageHeader
        title={`${t('title')} — ${student.full_name}`}
        subtitle={billingMonthLabel}
        mobileCentered
        actions={
          isOwnerOrAdmin ? (
            <BillingDetailHeaderActions
              studentId={studentId}
              billingMonth={billingMonth}
              billingData={
                billingData
                  ? {
                      id: billingData.id,
                      is_paid: billingData.is_paid,
                      is_approved: billingData.is_approved,
                      invoice_number: billingData.invoice_number ?? null,
                      credit_note_number: billingData.credit_note_number ?? null,
                    }
                  : null
              }
            />
          ) : undefined
        }
      />

      <Link
        href={`/billing?month=${billingMonth}`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-6"
      >
        <ArrowRight size={14} />
        {tBilling('title')}
      </Link>

      {/* Billing summary card */}
      {billingData && (
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3 lg:grid-cols-5 lg:gap-6">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {tBilling('table.lessons')}
            </p>
            <p className="text-lg font-bold text-foreground font-mono" dir="ltr">
              ₪{Number(billingData.lessons_amount).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {tBilling('table.subscriptions')}
            </p>
            <p className="text-lg font-bold text-foreground font-mono" dir="ltr">
              ₪{Number(billingData.subscriptions_amount).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {tBilling('table.cancellations')}
            </p>
            <p className="text-lg font-bold text-foreground font-mono" dir="ltr">
              ₪{Number(billingData.cancellations_amount).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {tBilling('table.total')}
            </p>
            <p className="text-xl font-bold text-foreground font-mono" dir="ltr">
              ₪{Number(billingData.total_amount).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {tBilling('table.status')}
            </p>
            {status && <StatusBadge status={status} />}
          </div>
        </div>
      )}

      {/* Lessons breakdown */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">{t('lessonsBreakdown')}</h2>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noLessons')}</p>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm"
                >
                  <p className="font-medium text-foreground">
                    {new Date(lesson.start_at).toLocaleDateString(intlLocale, { timeZone: timezone })}{' '}
                    {new Date(lesson.start_at).toLocaleTimeString(intlLocale, {
                      timeZone: timezone,
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="mt-1 text-muted-foreground">{lesson.teacher_name}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{lessonTypeLabel(lesson.lesson_type)}</span>
                    <StatusBadge status={lesson.status} />
                  </div>
                  <div className="mt-2 grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
                    <span dir="ltr" className="font-mono text-foreground">
                      {lesson.price_per_student != null ? `₪${lesson.price_per_student}` : '—'}
                    </span>
                    <span className="text-end text-xs text-muted-foreground">{t('colPricePerStudent')}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:block">
              <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <table className="min-w-[720px] w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colDate')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colTeacher')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colType')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colStatus')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colPricePerStudent')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lessons.map((lesson) => (
                      <tr key={lesson.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-sm text-foreground">
                          {new Date(lesson.start_at).toLocaleDateString(intlLocale, { timeZone: timezone })}
                          {' '}
                          {new Date(lesson.start_at).toLocaleTimeString(intlLocale, { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-foreground">{lesson.teacher_name}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{lessonTypeLabel(lesson.lesson_type)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={lesson.status} /></td>
                        <td className="px-4 py-2.5 font-mono text-sm text-foreground" dir="ltr">
                          {lesson.price_per_student != null ? `₪${lesson.price_per_student}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Subscriptions breakdown */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">{t('subscriptionsBreakdown')}</h2>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noSubscriptions')}</p>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm"
                >
                  <p className="font-medium text-foreground">{subscriptionTypeLabel(sub.subscription_type)}</p>
                  <div className="mt-2 grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
                    <span dir="ltr" className="font-mono text-foreground">
                      ₪{Number(sub.monthly_amount).toFixed(2)}
                    </span>
                    <span className="text-end text-xs text-muted-foreground">{t('colMonthlyAmount')}</span>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
                      <dt className="col-start-2 row-start-1 text-end">{t('colStartDate')}</dt>
                      <dd className="col-start-1 row-start-1 text-foreground">{formatDateOnly(sub.start_date)}</dd>
                    </div>
                    <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
                      <dt className="col-start-2 row-start-1 text-end">{t('colEndDate')}</dt>
                      <dd className="col-start-1 row-start-1 text-foreground">{sub.end_date ? formatDateOnly(sub.end_date) : '—'}</dd>
                    </div>
                  </dl>
                  <div className="mt-2">
                    <StatusBadge
                      status={sub.is_paused ? 'cancelled' : 'completed'}
                      label={sub.is_paused ? t('subPaused') : t('subActive')}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:block">
              <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <table className="min-w-[640px] w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colType')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colMonthlyAmount')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colStartDate')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colEndDate')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {subscriptions.map((sub) => (
                      <tr key={sub.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-sm text-foreground">{subscriptionTypeLabel(sub.subscription_type)}</td>
                        <td className="px-4 py-2.5 font-mono text-sm text-foreground" dir="ltr">₪{Number(sub.monthly_amount).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-sm text-foreground">{formatDateOnly(sub.start_date)}</td>
                        <td className="px-4 py-2.5 text-sm text-foreground">{sub.end_date ? formatDateOnly(sub.end_date) : '—'}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={sub.is_paused ? 'cancelled' : 'completed'} label={sub.is_paused ? t('subPaused') : t('subActive')} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Cancellation events */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">{t('cancellationsBreakdown')}</h2>
        {cancellations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noCancellations')}</p>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {cancellations.map((event) => (
                <CancellationEventCard
                  key={event.id}
                  event={event}
                  isOwnerOrAdmin={isOwnerOrAdmin}
                />
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:block">
              <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <table className={isOwnerOrAdmin ? 'min-w-[880px] w-full' : 'min-w-[720px] w-full'}>
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colCancellationDate')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colHoursBefore')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colLt24h')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colChargeApproved')}</th>
                      <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colManualAmount')}</th>
                      {isOwnerOrAdmin && (
                        <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase text-muted-foreground">{t('colActions')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cancellations.map((event) => (
                      <CancellationEventRow
                        key={event.id}
                        event={event}
                        isOwnerOrAdmin={isOwnerOrAdmin}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Manual adjustment */}
      {isOwnerOrAdmin && billingData && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('manualAdjustment')}</h2>
          <ManualAdjustmentForm
            billingId={billingData.id}
            currentAmount={billingData.manual_adjustment_amount}
            currentReason={billingData.manual_adjustment_reason}
          />
        </section>
      )}
    </div>
  )
}
