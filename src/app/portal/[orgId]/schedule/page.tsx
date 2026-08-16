import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgTimezone } from '@/lib/organizations'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatTime, formatDate } from '@/lib/lessons'
import { parseAppLocale } from '@/lib/i18n/locale'
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
  const [timezone, locale, t] = await Promise.all([
    getOrgTimezone(orgId),
    getLocale(),
    getTranslations('portal.schedule'),
  ])
  const appLocale = parseAppLocale(locale)
  const now = new Date().toISOString()

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
    teachers: { profiles: { full_name: string } }
    lesson_students: Array<{ student_id: string; students: { full_name: string } }>
  }

  // Fetch upcoming lessons (scheduled, from now)
  const { data: upcomingRaw } = await db
    .from('lessons')
    .select(`
      id, start_at, end_at, status,
      teachers ( profiles ( full_name ) ),
      lesson_students!inner ( student_id, students ( full_name ) )
    `)
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')
    .gte('start_at', now)
    .in('lesson_students.student_id', studentIds)
    .order('start_at', { ascending: true })
    .limit(50)

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

  function mapLesson(raw: unknown) {
    const row = raw as unknown as LessonRow
    const dateStr = new Date(row.start_at).toLocaleDateString('sv-SE', { timeZone: timezone })
    return {
      id: row.id,
      startAt: row.start_at,
      endAt: row.end_at,
      status: row.status,
      studentName: row.lesson_students?.[0]?.students?.full_name ?? '',
      teacherName: (row.teachers as unknown as { profiles: { full_name: string } })?.profiles?.full_name ?? '',
      dateLabel: formatDate(row.start_at, timezone, appLocale),
      timeLabel: `${formatTime(row.start_at, timezone, appLocale)}–${formatTime(row.end_at, timezone, appLocale)}`,
      dayKey: dateStr,
    }
  }

  const upcoming = (upcomingRaw ?? []).map(mapLesson)
  const history = (historyRaw ?? []).map(mapLesson)

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
          cancelAction={boundCancel}
        />
      </main>

      <PortalTabBar orgId={orgId} active="schedule" />
    </div>
  )
}
