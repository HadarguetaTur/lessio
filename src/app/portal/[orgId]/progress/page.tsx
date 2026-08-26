import { redirect } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgTimezone } from '@/lib/organizations'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatDate } from '@/lib/lessons'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getActiveGoalsForStudents } from '@/lib/goals'
import { getVisibleNotesForStudent } from '@/lib/lessons/notes'
import { PortalTabBar } from '@/components/portal/PortalTabBar'
import { PortalProgressView } from '@/components/portal/PortalProgressView'

type StudentProgress = {
  studentId: string
  studentName: string
  attendance: { attended: number; total: number; rate: number }
  homework: { completed: number; total: number; rate: number; avgScore: number | null }
  goals: Array<{ id: string; subject: string; description: string; status: string; targetDate: string | null }>
  notes: Array<{ id: string; body: string; teacherName: string; lessonDate: string }>
  /** Same rolling window as the cards, so the headline cannot contradict them. */
  periodSummary: { lessons: number; homeworkDone: number }
}

export default async function PortalProgressPage({
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
    getTranslations('portal.progress'),
  ])
  const appLocale = parseAppLocale(locale)

  // Get parent's students
  const { data: relationships } = await db
    .from('relationships')
    .select('student_id, students ( full_name )')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)

  type RelRow = { student_id: string; students: { full_name: string } | null }
  const students = (relationships ?? []).map((r) => {
    const row = r as unknown as RelRow
    return { id: row.student_id, name: row.students?.full_name ?? '' }
  })
  const studentIds = students.map((s) => s.id)

  if (students.length === 0) {
    return (
      <div className="flex flex-col flex-1 pb-20">
        <header className="px-4 py-3.5 border-b border-border bg-card flex items-center gap-2">
          <TrendingUp size={16} className="text-muted-foreground" />
          <h1 className="font-semibold text-foreground text-sm">{t('title')}</h1>
        </header>
        <main className="flex-1 p-4">
          <div className="bg-muted/40 rounded-xl border border-border py-10 text-center">
            <p className="text-sm text-muted-foreground">{t('noStudents')}</p>
          </div>
        </main>
        <PortalTabBar orgId={orgId} active="progress" />
      </div>
    )
  }

  // Compute progress for 30 and 90 day periods.
  // Every number on this screen describes the same rolling window. The summary
  // line used to count the calendar month while the attendance card beneath it
  // counted the rolling window, so the two disagreed about the same child.
  async function computeProgress(days: number): Promise<StudentProgress[]> {
    const now = new Date()
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

    const results: StudentProgress[] = []

    for (const student of students) {
      // Attendance: lessons where student is enrolled
      const { data: lessonData } = await db
        .from('lesson_students')
        .select('lesson_id, lessons!inner ( status, start_at )')
        .eq('student_id', student.id)
        .gte('lessons.start_at', since)
        .in('lessons.status', ['completed', 'cancelled', 'no_show'])

      type AttRow = { lesson_id: string; lessons: { status: string; start_at: string } }
      const lessons = (lessonData ?? []) as unknown as AttRow[]
      const attended = lessons.filter((l) => l.lessons.status === 'completed').length
      const total = lessons.length
      const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 0

      // Homework
      const { data: hwData } = await db
        .from('homework_assignments')
        .select('id, status')
        .eq('organization_id', orgId)
        .eq('student_id', student.id)
        .eq('sent', true)
        .gte('created_at', since)

      const hwTotal = (hwData ?? []).length
      const hwCompleted = (hwData ?? []).filter((h) => (h as { status: string }).status === 'done').length
      const hwRate = hwTotal > 0 ? Math.round((hwCompleted / hwTotal) * 100) : 0

      // Average score from submissions.
      // Scoped to the same assignments the counts above are built from, so the
      // average can never describe work the "N of M tasks" line says does not
      // exist. Unscoped, this produced "0 of 0 tasks · average score 94".
      const assignmentIds = (hwData ?? []).map((h) => (h as { id: string }).id)
      const { data: scoreData } = assignmentIds.length > 0
        ? await db
            .from('homework_submissions')
            .select('score')
            .eq('organization_id', orgId)
            .eq('student_id', student.id)
            .in('assignment_id', assignmentIds)
            .not('score', 'is', null)
            .gte('submitted_at', since)
        : { data: [] }

      const scores = (scoreData ?? []).map((s) => (s as { score: number }).score).filter((s) => s != null)
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

      // Headline summary — same window and the same rows as the cards below it.
      const periodLessons = attended
      const periodHwDone = hwCompleted

      // Teacher notes (visible to parent)
      const visibleNotes = await getVisibleNotesForStudent(orgId, student.id, 10)

      results.push({
        studentId: student.id,
        studentName: student.name,
        attendance: { attended, total, rate: attendanceRate },
        homework: { completed: hwCompleted, total: hwTotal, rate: hwRate, avgScore },
        goals: [], // filled below
        notes: visibleNotes.map((n) => ({
          id: n.id,
          body: n.body.length > 200 ? n.body.slice(0, 200) + '…' : n.body,
          teacherName: n.teacherName,
          lessonDate: n.lessonStartAt ? formatDate(n.lessonStartAt, timezone, appLocale) : '',
        })),
        periodSummary: { lessons: periodLessons, homeworkDone: periodHwDone },
      })
    }

    // Goals (same regardless of period)
    const goals = await getActiveGoalsForStudents(orgId, studentIds)
    for (const result of results) {
      result.goals = goals
        .filter((g) => g.studentId === result.studentId)
        .map((g) => ({
          id: g.id,
          subject: g.subject,
          description: g.description,
          status: g.status,
          targetDate: g.targetDate,
        }))
    }

    return results
  }

  const [progress30, progress90] = await Promise.all([
    computeProgress(30),
    computeProgress(90),
  ])

  return (
    <div className="flex flex-col flex-1 pb-20">
      <header className="px-4 py-3.5 border-b border-border bg-card flex items-center gap-2">
        <TrendingUp size={16} className="text-muted-foreground" />
        <h1 className="font-semibold text-foreground text-sm">{t('title')}</h1>
      </header>

      <main className="flex-1 p-4">
        <PortalProgressView progress30={progress30} progress90={progress90} />
      </main>

      <PortalTabBar orgId={orgId} active="progress" />
    </div>
  )
}
