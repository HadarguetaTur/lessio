import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgTimezone } from '@/lib/organizations'
import { formatTime, formatDate } from '@/lib/lessons'
import { PortalTabBar } from '@/components/portal/PortalTabBar'

/**
 * Portal home — upcoming lessons + outstanding balance.
 * Per /docs/sprint-13-scope.md § Story 7.
 */
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
  const timezone = await getOrgTimezone(orgId)
  const now = new Date().toISOString()

  // Fetch student IDs for this parent first — .in() requires an array, not a subquery
  const { data: relationships } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)

  const studentIds = (relationships ?? []).map((r) => r.student_id)

  const [parentResult, orgResult, balanceResult] = await Promise.all([
    db.from('parents').select('full_name').eq('id', session.parentId).single(),
    db.from('organizations').select('name').eq('id', orgId).single(),
    // Outstanding balance (pending charges)
    db
      .from('charges')
      .select('amount')
      .eq('parent_id', session.parentId)
      .eq('organization_id', orgId)
      .eq('status', 'pending'),
  ])

  // Upcoming scheduled lessons for all students of this parent.
  // Query from lessons with !inner join so filters apply to the lesson row itself —
  // filtering on embedded resources from lesson_students side silently returns null.
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
        .limit(4)
    : { data: [] }

  const parentName = parentResult.data?.full_name ?? ''
  const orgName = orgResult.data?.name ?? ''
  const lessons = lessonsResult.data ?? []
  const balance = (balanceResult.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)

  return (
    <div className="flex flex-col flex-1 pb-16">
      {/* Top bar */}
      <header className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <span className="font-semibold text-gray-900">{orgName}</span>
        <span className="text-sm text-gray-500">שלום, {parentName}</span>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Balance */}
        {balance > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800 font-medium">יתרה לתשלום</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">₪{balance.toFixed(2)}</p>
            <Link
              href={`/portal/${orgId}/payments`}
              className="mt-2 inline-block text-sm text-amber-700 underline"
            >
              לפרטים ותשלום →
            </Link>
          </div>
        )}

        {/* Upcoming lessons */}
        <div>
          <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">שיעורים קרובים</h2>
          {lessons.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">אין שיעורים מתוכננים</p>
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
                  <div key={row.id} className="bg-white border border-gray-100 rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 leading-tight">{studentName}</p>
                      <p className="text-xs text-gray-500 mt-0.5" dir="ltr">
                        {formatDate(row.start_at, timezone)} &middot; {formatTime(row.start_at, timezone)}–{formatTime(row.end_at, timezone)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 shrink-0 mt-0.5">{teacherName}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Book CTA */}
        <Link
          href={`/portal/${orgId}/book`}
          className="block w-full text-center py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          קבע שיעור חדש
        </Link>
      </main>

      <PortalTabBar orgId={orgId} active="home" />
    </div>
  )
}
