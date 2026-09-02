import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, AlertCircle, Target, ArrowLeft } from 'lucide-react'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgTimezone } from '@/lib/organizations'
import { getPortalSettings } from '@/lib/organizations/portalSettings'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatTime, formatDate } from '@/lib/lessons'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { OPEN_CHARGE_STATUSES } from '@/lib/charges'
import { PortalTabBar } from '@/components/portal/PortalTabBar'
import { DeletionRequestButton } from '@/components/portal/DeletionRequestButton'
import { getActiveGoalsForStudents } from '@/lib/goals'
import { requestDeletionAction } from './actions'

export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  const db = createServiceRoleClient()
  const [timezone, locale, t, tStatus, portal] = await Promise.all([
    getOrgTimezone(orgId),
    getLocale(),
    getTranslations('portal.home'),
    getTranslations('portal.schedule.status'),
    getPortalSettings(orgId),
  ])
  const appLocale = parseAppLocale(locale)
  const now = new Date().toISOString()

  const { data: relationships } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)

  const studentIds = (relationships ?? []).map((r) => r.student_id)

  const [parentResult, orgResult, balanceResult, goals] = await Promise.all([
    db.from('parents').select('full_name').eq('id', session.parentId).single(),
    db.from('organizations').select('name').eq('id', orgId).single(),
    // Same definition of "owed" as /payments: every open status, and what is
    // left after partial payments. Summing raw `amount` over `pending` alone
    // showed a different number on each of the two screens.
    // An org that keeps payments off the portal gets no balance card at all —
    // a figure with nowhere to pay it is a question the teacher then has to
    // answer over WhatsApp.
    portal.payments
      ? db
          .from('charges')
          .select('amount, amount_paid')
          .eq('parent_id', session.parentId)
          .eq('organization_id', orgId)
          .in('status', OPEN_CHARGE_STATUSES)
      : Promise.resolve({ data: [] as Array<{ amount: number; amount_paid?: number | null }> }),
    getActiveGoalsForStudents(orgId, studentIds),
  ])

  const lessonsResult = studentIds.length > 0
    ? await db
        .from('lessons')
        .select(`
          id, start_at, end_at,
          teachers ( profiles ( full_name ) ),
          lesson_students!inner ( student_id, students ( full_name ) )
        `)
        .eq('organization_id', orgId)
        .eq('status', 'scheduled')
        .gte('start_at', now)
        .in('lesson_students.student_id', studentIds)
        .order('start_at', { ascending: true })
        .limit(3)
    : { data: [] }

  const parentName = parentResult.data?.full_name ?? ''
  const orgName = orgResult.data?.name ?? ''
  const lessons = lessonsResult.data ?? []
  const formatGoalDate = (isoDate: string) =>
    new Intl.DateTimeFormat(toIntlLocale(appLocale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${isoDate}T12:00:00Z`))

  const balance = (balanceResult.data ?? []).reduce(
    (sum, c) => sum + Math.max(0, Number(c.amount) - Number((c as { amount_paid?: number | null }).amount_paid ?? 0)),
    0
  )

  return (
    <div className="flex flex-col flex-1 pb-20">
      {/* Top bar */}
      {/* pe-14 clears the language toggle, which the portal shell floats over
          this corner (absolute top-2 end-2 in layout.tsx). Without it the
          greeting renders underneath it. */}
      <header className="ps-4 pe-14 py-3.5 border-b border-border flex justify-between items-center gap-3 bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 shrink-0 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-[10px] font-bold leading-none">L</span>
          </div>
          {/* The org name is the page's heading — every other portal screen has
              an h1 and this one had none. */}
          <h1 className="font-semibold text-foreground text-sm truncate">{orgName}</h1>
        </div>
        {/* The org name is the one that gives way: it truncates (min-w-0 above)
            while the short greeting keeps its full width. Letting both shrink
            squeezes the greeting into an unreadable ellipsis on a phone. */}
        <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
          {t('greeting', { name: parentName })}
        </span>
      </header>

      <main className="flex-1 p-4 space-y-5">
        {/* Balance card */}
        {balance > 0 && (
          <div className="rounded-xl overflow-hidden border border-amber-200">
            <div className="bg-amber-50 px-4 py-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={15} className="text-amber-600" />
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">{t('balanceTitle')}</p>
              </div>
              <p className="text-3xl font-bold text-amber-700 mb-3" dir="ltr">
                {formatCurrency(balance, appLocale, 2)}
              </p>
              <Link
                href={`/portal/${orgId}/payments`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                {t('balanceCta')}
                <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden />
              </Link>
            </div>
          </div>
        )}

        {/* Upcoming lessons */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              {t('upcomingTitle')}
            </p>
            <Link
              href={`/portal/${orgId}/schedule`}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              {t('viewAll')}
              <ArrowLeft size={12} className="rtl:rotate-180" aria-hidden />
            </Link>
          </div>

          {lessons.length === 0 ? (
            <div className="bg-muted/40 rounded-xl border border-border py-10 flex flex-col items-center gap-2 text-center">
              <CalendarDays size={24} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('noUpcoming')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lessons.map((lesson) => {
                type LessonRow = {
                  id: string
                  start_at: string
                  end_at: string
                  teachers: { profiles: { full_name: string } }
                  lesson_students: Array<{ student_id: string; students: { full_name: string } }>
                }
                const row = lesson as unknown as LessonRow
                const studentName = row.lesson_students?.[0]?.students?.full_name ?? ''
                const teacherName = (row.teachers as unknown as { profiles: { full_name: string } })?.profiles?.full_name ?? ''
                return (
                  <div
                    key={row.id}
                    className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight">{studentName}</p>
                      <p className="text-xs text-muted-foreground mt-1" dir="ltr">
                        {formatDate(row.start_at, timezone, appLocale)} · {formatTime(row.start_at, timezone, appLocale)}–{formatTime(row.end_at, timezone, appLocale)}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-xs text-muted-foreground">{teacherName}</p>
                      <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                        {tStatus('scheduled')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Learning goals */}
        {goals.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Target size={14} className="text-muted-foreground" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                {t('goalsTitle')}
              </p>
            </div>
            <div className="space-y-2">
              {goals.map((goal) => (
                <div key={goal.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">{goal.subject}</span>
                      <p className="text-sm text-foreground mt-0.5">{goal.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{goal.studentName}</p>
                    </div>
                    {/* target_date is a raw 'YYYY-MM-DD' from Postgres; it used
                        to print as-is next to fully localised dates. */}
                    {goal.targetDate && (
                      <span className="text-xs text-muted-foreground shrink-0 text-end">
                        {t('goalTarget', { date: formatGoalDate(goal.targetDate) })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments link (when no balance shown above) */}
        {portal.payments && balance === 0 && (
          <Link
            href={`/portal/${orgId}/payments`}
            className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('paymentHistory')}
            <ArrowLeft size={12} className="rtl:rotate-180" aria-hidden />
          </Link>
        )}
      </main>

      {/* GDPR deletion request */}
      <div className="px-4 pb-4 flex justify-center">
        <DeletionRequestButton
          action={requestDeletionAction.bind(null, orgId)}
        />
      </div>

      <PortalTabBar orgId={orgId} active="home" />
    </div>
  )
}
