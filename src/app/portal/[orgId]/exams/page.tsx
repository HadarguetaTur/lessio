import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { listExams, type StudentExam } from '@/lib/students/exams'
import { PortalTabBar } from '@/components/portal/PortalTabBar'
import { PortalExamReportForm } from '@/components/portal/PortalExamReportForm'
import { reportExamAction } from './actions'

export default async function PortalExamsPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  const [t, locale] = await Promise.all([getTranslations('portal.exams'), getLocale()])
  const intlLocale = toIntlLocale(parseAppLocale(locale))
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'numeric', year: 'numeric' })
      .format(new Date(`${iso}T12:00:00Z`))

  const db = createServiceRoleClient()

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
  const studentNameMap = new Map(students.map((s) => [s.id, s.name]))

  const examsByStudent = await Promise.all(students.map((s) => listExams(orgId, s.id)))
  const exams: StudentExam[] = examsByStudent
    .flat()
    .sort((a, b) => (a.examDate < b.examDate ? 1 : -1))
    .slice(0, 50)

  return (
    <div className="flex flex-col flex-1 pb-20">
      <header className="px-4 py-3.5 border-b border-border bg-card">
        <h1 className="font-semibold text-foreground text-sm">{t('title')}</h1>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {students.length > 0 && (
          <PortalExamReportForm
            action={reportExamAction.bind(null, orgId)}
            students={students}
          />
        )}

        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">{t('listTitle')}</p>
          {exams.length === 0 ? (
            <div className="bg-muted/40 rounded-xl border border-border py-10 flex flex-col items-center gap-2 text-center">
              <ClipboardList size={24} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            </div>
          ) : (
            exams.map((ex) => (
              <div key={ex.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {ex.subject} · {ex.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {studentNameMap.get(ex.studentId) ?? ''} · {formatDate(ex.examDate)}
                    </p>
                    {ex.description && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                        {ex.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {ex.score != null ? (
                      <span className="text-sm font-bold text-foreground" dir="ltr">
                        {ex.score}/{ex.maxScore}
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                        {t('statusReported')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <PortalTabBar orgId={orgId} active="exams" />
    </div>
  )
}
