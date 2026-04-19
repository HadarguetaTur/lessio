import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, User, BookOpen, FileText, Receipt, Target } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getStudentOverview } from '@/lib/students/overview'
import { getAssignments } from '@/lib/homework'
import { getGoalsForStudent } from '@/lib/goals'
import { getNotesForStudent } from '@/lib/lessons/notes'
import { getOrgTimezone } from '@/lib/organizations'
import { formatDate } from '@/lib/lessons'
import { GoalsSection } from '@/components/dashboard/students/GoalsSection'
import { createGoalAction, updateGoalStatusAction, deleteGoalAction } from './actions'
import { getTranslations, getLocale } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'

type Tab = 'overview' | 'lessons' | 'homework' | 'billing' | 'notes'

const TAB_ICONS: Record<Tab, typeof User> = {
  overview: User,
  lessons: BookOpen,
  homework: FileText,
  billing: Receipt,
  notes: Target,
}

export default async function StudentProfilePage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await props.params
  const { tab: tabParam } = await props.searchParams
  const activeTab: Tab = (['overview', 'lessons', 'homework', 'billing', 'notes'] as Tab[]).includes(tabParam as Tab)
    ? (tabParam as Tab)
    : 'overview'

  const { orgId, role } = await getSession()
  const [t, tCommon, locale] = await Promise.all([
    getTranslations('studentProfile'),
    getTranslations('common'),
    getLocale(),
  ])
  const appLocale = parseAppLocale(locale)

  const db = createServiceRoleClient()

  // Fetch student
  const { data: student, error: studentErr } = await db
    .from('students')
    .select('id, full_name, phone, status, grade, created_at')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (studentErr || !student) notFound()

  const canEdit = role === 'owner' || role === 'admin' || role === 'teacher'
  const timezone = await getOrgTimezone(orgId)

  // Parallel data fetch based on tab
  const [overview, assignments, goals, notes, lessonsResult, chargesResult] = await Promise.all([
    activeTab === 'overview' ? getStudentOverview(orgId, id) : null,
    activeTab === 'homework' ? getAssignments(orgId, { studentId: id }) : null,
    activeTab === 'notes' ? getGoalsForStudent(orgId, id) : null,
    activeTab === 'notes' ? getNotesForStudent(orgId, id) : null,
    activeTab === 'lessons'
      ? db.from('lesson_students').select(`
          lessons ( id, start_at, end_at, status, teachers ( profiles ( full_name ) ) )
        `)
        .eq('student_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      : { data: [] },
    activeTab === 'billing'
      ? (async () => {
          const { data: relData } = await db
            .from('relationships')
            .select('parent_id')
            .eq('student_id', id)
            .eq('organization_id', orgId)
            .eq('is_primary', true)
            .maybeSingle()
          const parentId = (relData as { parent_id: string } | null)?.parent_id
          if (!parentId) return { data: [] }
          return db.from('charges')
            .select('id, amount, status, created_at, description')
            .eq('organization_id', orgId)
            .eq('parent_id', parentId)
            .order('created_at', { ascending: false })
            .limit(50)
        })()
      : { data: [] },
  ])

  const TAB_LABELS: Record<Tab, string> = {
    overview: t('tabs.overview'),
    lessons: t('tabs.lessons'),
    homework: t('tabs.homework'),
    billing: t('tabs.billing'),
    notes: t('tabs.notes'),
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/students" className="hover:text-gray-700">{tCommon('nav.students')}</Link>
        <ArrowRight size={14} className="rotate-180" />
        <span className="text-gray-900 font-medium">{(student as { full_name: string }).full_name}</span>
      </div>

      {/* Student header card */}
      <div className="bg-white rounded-lg border border-gray-100 p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <User size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{(student as { full_name: string }).full_name}</h1>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            {(student as { grade: string | null }).grade && (
              <span>{t('grade')}: {(student as { grade: string | null }).grade}</span>
            )}
            <span>{(student as { phone: string | null }).phone ?? ''}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {(['overview', 'lessons', 'homework', 'billing', 'notes'] as Tab[]).map((tab) => {
          const Icon = TAB_ICONS[tab]
          const isActive = activeTab === tab
          return (
            <Link
              key={tab}
              href={`/students/${id}?tab=${tab}`}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} />
              {TAB_LABELS[tab]}
            </Link>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-lg border border-gray-100 p-5">
        {activeTab === 'overview' && overview && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">{t('overview.title')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <KpiCard label={t('overview.attendance')} value={`${overview.attendanceRate}%`} />
              <KpiCard label={t('overview.homeworkCompletion')} value={`${overview.homeworkCompletionRate}%`} />
              <KpiCard label={t('overview.balance')} value={`₪${overview.outstandingBalance.toFixed(2)}`} />
              <KpiCard label={t('overview.totalLessons')} value={String(overview.totalLessons)} />
              <KpiCard label={t('overview.completedLessons')} value={String(overview.completedLessons)} />
              <KpiCard label={t('overview.doneAssignments')} value={`${overview.doneAssignments}/${overview.totalAssignments}`} />
            </div>
          </div>
        )}

        {activeTab === 'lessons' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">{t('tabs.lessons')}</h2>
            {(lessonsResult.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">{t('noLessons')}</p>
            ) : (
              <div className="space-y-2">
                {(lessonsResult.data ?? []).map((ls) => {
                  type LsRow = { lessons: { id: string; start_at: string; end_at: string; status: string; teachers: { profiles: { full_name: string } } } | null }
                  const lesson = (ls as unknown as LsRow).lessons
                  if (!lesson) return null
                  return (
                    <Link
                      key={lesson.id}
                      href={`/lessons/${lesson.id}`}
                      className="block border border-gray-50 rounded-lg p-3 hover:bg-gray-50 transition-colors text-sm"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{formatDate(lesson.start_at, timezone, appLocale)}</span>
                        <span className="text-xs text-gray-500">{lesson.teachers?.profiles?.full_name}</span>
                      </div>
                      <span className="text-xs text-gray-400">{tCommon(`status.${lesson.status}`)}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'homework' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">{t('tabs.homework')}</h2>
            {(assignments ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">{t('noHomework')}</p>
            ) : (
              <div className="space-y-2">
                {(assignments ?? []).map((a) => (
                  <Link
                    key={a.id}
                    href={`/homework/${a.id}`}
                    className="block border border-gray-50 rounded-lg p-3 hover:bg-gray-50 transition-colors text-sm"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{a.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        a.status === 'done' ? 'bg-green-50 text-green-700' :
                        a.status === 'overdue' ? 'bg-red-50 text-red-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {tCommon(`homeworkStatus.${a.status}`)}
                      </span>
                    </div>
                    {a.dueDate && <span className="text-xs text-gray-400">{t('due')}: {a.dueDate}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">{t('tabs.billing')}</h2>
            {(chargesResult.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">{t('noCharges')}</p>
            ) : (
              <div className="space-y-2">
                {(chargesResult.data ?? []).map((c) => {
                  type ChargeRow = { id: string; amount: number; status: string; created_at: string; description: string | null }
                  const charge = c as unknown as ChargeRow
                  return (
                    <div key={charge.id} className="border border-gray-50 rounded-lg p-3 text-sm flex justify-between items-center">
                      <div>
                        <span className="font-medium">₪{Number(charge.amount).toFixed(2)}</span>
                        {charge.description && <span className="text-gray-500 ms-2 text-xs">{charge.description}</span>}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        charge.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {tCommon(`chargeStatus.${charge.status}`)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-6">
            {/* Goals */}
            <GoalsSection
              goals={goals ?? []}
              studentId={id}
              createAction={createGoalAction}
              updateStatusAction={updateGoalStatusAction}
              deleteAction={deleteGoalAction}
              canEdit={canEdit}
            />

            {/* Lesson notes */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">{t('lessonNotes')}</h3>
              {(notes ?? []).length === 0 ? (
                <p className="text-sm text-gray-400">{t('noNotes')}</p>
              ) : (
                <div className="space-y-2">
                  {(notes ?? []).map((note) => (
                    <div key={note.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                      <p className="text-gray-700 whitespace-pre-wrap">{note.body}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {note.teacherName} · {formatDate(note.lessonStartAt, timezone, appLocale)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-lg font-bold text-gray-900" dir="ltr">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
