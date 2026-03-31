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

  const [parentResult, orgResult, lessonsResult, balanceResult] = await Promise.all([
    db.from('parents').select('full_name').eq('id', session.parentId).single(),
    db.from('organizations').select('name').eq('id', orgId).single(),
    // Upcoming lessons for all students of this parent
    studentIds.length > 0
      ? db
          .from('lesson_students')
          .select(`
            lessons (
              id, start_at, end_at, status,
              teachers ( profiles ( full_name ) )
            ),
            students ( full_name )
          `)
          .eq('organization_id', orgId)
          .in('student_id', studentIds)
          .eq('lessons.status', 'scheduled')
          .gte('lessons.start_at', now)
          .order('lessons.start_at', { ascending: true })
          .limit(4)
      : Promise.resolve({ data: [] }),
    // Outstanding balance (pending charges)
    db
      .from('charges')
      .select('amount')
      .eq('parent_id', session.parentId)
      .eq('organization_id', orgId)
      .eq('status', 'pending'),
  ])

  const parentName = parentResult.data?.full_name ?? ''
  const orgName = orgResult.data?.name ?? ''
  const lessons = lessonsResult.data ?? []
  const balance = (balanceResult.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)

  return (
    <div className="flex flex-col flex-1 pb-16">
      {/* Top bar */}
      <header className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <span className="font-bold text-gray-900">{orgName}</span>
        <span className="text-sm text-gray-500">{parentName}</span>
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
          <h2 className="text-sm font-semibold text-gray-500 mb-3">שיעורים קרובים</h2>
          {lessons.length === 0 ? (
            <p className="text-sm text-gray-400">אין שיעורים מתוכננים</p>
          ) : (
            <div className="space-y-2">
              {lessons.map((row) => {
                const lesson = row.lessons as unknown as {
                  id: string
                  start_at: string
                  end_at: string
                  teachers: { profiles: { full_name: string } }
                }
                const student = row.students as unknown as { full_name: string }
                return (
                  <div key={lesson.id} className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(lesson.start_at, timezone)} · {formatTime(lesson.start_at, timezone)}–{formatTime(lesson.end_at, timezone)}
                    </p>
                    <p className="text-xs text-gray-400">{lesson.teachers.profiles.full_name}</p>
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
