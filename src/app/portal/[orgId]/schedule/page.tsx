import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgTimezone } from '@/lib/organizations'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatTime, formatDate } from '@/lib/lessons'
import { parseAppLocale } from '@/lib/i18n/locale'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { getPortalSettings } from '@/lib/organizations/portalSettings'
import { getCancellationPolicyServiceRole } from '@/lib/cancellation-policy/service'
import {
  previewCancellationCharge,
  isCancellableByParent,
} from '@/lib/cancellation-flow/previewCancellationCharge'
import { PortalTabBar } from '@/components/portal/PortalTabBar'
import { PortalScheduleView } from '@/components/portal/PortalScheduleView'
import { cancelLessonAction } from './actions'

export default async function PortalSchedulePage({
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
  const [timezone, locale, t, portal] = await Promise.all([
    getOrgTimezone(orgId),
    getLocale(),
    getTranslations('portal.schedule'),
    getPortalSettings(orgId),
  ])
  const appLocale = parseAppLocale(locale)
  const nowDate = new Date()
  const now = nowDate.toISOString()

  // Get parent's students
  const { data: relationships } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)

  const studentIds = (relationships ?? []).map((r) => r.student_id)

  if (studentIds.length === 0) {
    return (
      <div className="flex flex-col flex-1 pb-20">
        <header className="px-4 py-3.5 border-b border-border bg-card flex items-center gap-2">
          <CalendarDays size={16} className="text-muted-foreground" />
          <h1 className="font-semibold text-foreground text-sm">{t('title')}</h1>
        </header>
        <main className="flex-1 p-4">
          <div className="bg-muted/40 rounded-xl border border-border py-10 flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">{t('noStudents')}</p>
          </div>
        </main>
        <PortalTabBar orgId={orgId} active="schedule" />
      </div>
    )
  }

  type LessonRow = {
    id: string
    start_at: string
    end_at: string
    status: string
    lesson_type?: string | null
    price_per_student?: number | null
    teachers: { hourly_rate?: number | null; profiles: { full_name: string } }
    lesson_students: Array<{ student_id: string; students: { full_name: string } }>
  }

  // Upcoming carries the pricing inputs so the cancel dialog can quote a real
  // amount before the parent commits. History does not need them.
  const { data: upcomingRaw } = await db
    .from('lessons')
    .select(`
      id, start_at, end_at, status, lesson_type, price_per_student,
      teachers ( hourly_rate, profiles ( full_name ) ),
      lesson_students!inner ( student_id, students ( full_name ) )
    `)
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')
    .gte('start_at', now)
    .in('lesson_students.student_id', studentIds)
    .order('start_at', { ascending: true })
    .limit(50)

  // Both reads are org-level, so one fetch covers every lesson on the page.
  // They sit after the no-students early return so an empty portal pays for
  // neither.
  const [pricing, policy] = await Promise.all([
    getOrgPricing(orgId),
    getCancellationPolicyServiceRole(orgId),
  ])

  // Fetch history (completed/cancelled/no_show, past)
  const { data: historyRaw } = await db
    .from('lessons')
    .select(`
      id, start_at, end_at, status,
      teachers ( profiles ( full_name ) ),
      lesson_students!inner ( student_id, students ( full_name ) )
    `)
    .eq('organization_id', orgId)
    .in('status', ['completed', 'cancelled', 'no_show'])
    .lte('start_at', now)
    .in('lesson_students.student_id', studentIds)
    .order('start_at', { ascending: false })
    .limit(50)

  function mapLesson(raw: unknown, withCancelPreview = false) {
    const row = raw as unknown as LessonRow
    const dateStr = new Date(row.start_at).toLocaleDateString('sv-SE', { timeZone: timezone })
    // An org that keeps cancellations off the portal gets no cancel button and,
    // since the preview only exists to price that button, no preview either.
    const cancellable =
      withCancelPreview && portal.cancellation && isCancellableByParent(row.start_at, nowDate)

    // The preview is resolved here, in the server component, and only its
    // outcome crosses to the client. PortalScheduleView is a client component,
    // so anything on `row` would land in the RSC payload — including the
    // teacher's hourly_rate, which the parent must never see.
    let cancelPreview = null
    if (cancellable) {
      const result = previewCancellationCharge(
        {
          start_at: row.start_at,
          end_at: row.end_at,
          lesson_type: row.lesson_type ?? null,
          price_per_student: row.price_per_student ?? null,
          teacherHourlyRate: row.teachers?.hourly_rate ?? null,
        },
        nowDate,
        pricing,
        policy
      )
      // `missing_rate` means "chargeable but unpriceable" — showing it as ₪0
      // would promise a free cancellation the school still has to bill for.
      const unknownAmount = result.shouldCharge && result.amount <= 0
      cancelPreview = {
        willCharge: result.shouldCharge,
        unknownAmount,
        amountLabel:
          result.shouldCharge && !unknownAmount
            ? formatCurrency(result.amount, appLocale, 2)
            : null,
      }
    }

    return {
      id: row.id,
      startAt: row.start_at,
      endAt: row.end_at,
      status: row.status,
      studentName: row.lesson_students?.[0]?.students?.full_name ?? '',
      teacherName: row.teachers?.profiles?.full_name ?? '',
      dateLabel: formatDate(row.start_at, timezone, appLocale),
      timeLabel: `${formatTime(row.start_at, timezone, appLocale)}–${formatTime(row.end_at, timezone, appLocale)}`,
      dayKey: dateStr,
      cancellable,
      cancelPreview,
    }
  }

  const upcoming = (upcomingRaw ?? []).map((r) => mapLesson(r, true))
  const history = (historyRaw ?? []).map((r) => mapLesson(r))

  const boundCancel = cancelLessonAction.bind(null, orgId)

  return (
    <div className="flex flex-col flex-1 pb-20">
      <header className="px-4 py-3.5 border-b border-border bg-card flex items-center gap-2">
        <CalendarDays size={16} className="text-muted-foreground" />
        <h1 className="font-semibold text-foreground text-sm">{t('title')}</h1>
      </header>

      <main className="flex-1 p-4">
        <PortalScheduleView
          upcoming={upcoming}
          history={history}
          orgId={orgId}
          canBook={portal.booking}
          cancelAction={boundCancel}
        />
      </main>

      <PortalTabBar orgId={orgId} active="schedule" />
    </div>
  )
}
