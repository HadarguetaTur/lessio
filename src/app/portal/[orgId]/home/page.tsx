import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, AlertCircle, Target, ArrowLeft } from 'lucide-react'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgTimezone } from '@/lib/organizations'
import { getLocale } from 'next-intl/server'
import { formatTime, formatDate } from '@/lib/lessons'
import { parseAppLocale } from '@/lib/i18n/locale'
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
  const [timezone, locale] = await Promise.all([getOrgTimezone(orgId), getLocale()])
  const appLocale = parseAppLocale(locale)
  const now = new Date().toISOString()

  const { data: relationships } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)

  const studentIds = (relationships ?? []).map((r) => r.student_id)

  const [parentResult, orgResult, balanceResult] = await Promise.all([
    db.from('parents').select('full_name').eq('id', session.parentId).single(),
    db.from('organizations').select('name').eq('id', orgId).single(),
    db
      .from('charges')
      .select('amount')
      .eq('parent_id', session.parentId)
      .eq('organization_id', orgId)
      .eq('status', 'pending'),
  ])

  const goalsPromise = getActiveGoalsForStudents(orgId, studentIds)

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
  const balance = (balanceResult.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
  const goals = await goalsPromise

  return (
    <div className="flex flex-col flex-1 pb-20">
      {/* Top bar */}
      <header className="px-4 py-3.5 border-b border-border flex justify-between items-center bg-card">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-[10px] font-bold leading-none">L</span>
          </div>
          <span className="font-semibold text-foreground text-sm">{orgName}</span>
        </div>
        <span className="text-sm text-muted-foreground">שלום, {parentName}</span>
      </header>

      <main className="flex-1 p-4 space-y-5">
        {/* Balance card */}
        {balance > 0 && (
          <div className="rounded-xl overflow-hidden border border-amber-200">
            <div className="bg-amber-50 px-4 py-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={15} className="text-amber-600" />
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">יתרה לתשלום</p>
              </div>
              <p className="text-3xl font-bold text-amber-700 mb-3">₪{balance.toFixed(2)}</p>
              <Link
                href={`/portal/${orgId}/payments`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                לפרטים ותשלום ←
              </Link>
            </div>
          </div>
        )}

        {/* Upcoming lessons */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              שיעורים קרובים
            </p>
            <Link
              href={`/portal/${orgId}/schedule`}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              הכל
              <ArrowLeft size={12} />
            </Link>
          </div>

          {lessons.length === 0 ? (
            <div className="bg-muted/40 rounded-xl border border-border py-10 flex flex-col items-center gap-2 text-center">
              <CalendarDays size={24} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">אין שיעורים מתוכננים</p>
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
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">{teacherName}</p>
                      <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                        מתוכנן
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
                יעדי למידה
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
                    {goal.targetDate && (
                      <span className="text-xs text-muted-foreground shrink-0">{goal.targetDate}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments link (when no balance shown above) */}
        {balance === 0 && (
          <Link
            href={`/portal/${orgId}/payments`}
            className="text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            היסטוריית תשלומים →
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
