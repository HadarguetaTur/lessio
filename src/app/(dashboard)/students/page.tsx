import { GraduationCap, Users, Upload } from 'lucide-react'
import { z } from 'zod'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getStudentById, getStudents } from '@/lib/students'
import { getTeacherByProfileId, getTeachers } from '@/lib/teachers'
import { getGroups } from '@/lib/groups'
import { orgEnforcesWeeklyQuota } from '@/lib/booking'
import { StudentSearch } from '@/components/dashboard/students/StudentSearch'
import { createStudent } from './actions'
import { createGroup } from './group-actions'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { NewStudentSheet } from '@/components/dashboard/students/StudentSheet'
import { StudentsTable } from '@/components/dashboard/students/StudentsTable'
import { GroupsTable } from '@/components/dashboard/students/GroupsTable'
import { NewGroupSheet } from '@/components/dashboard/students/GroupFormSheet'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Tab = 'students' | 'groups'

export default async function StudentsPage(props: {
  searchParams: Promise<{ q?: string; status?: string; tab?: string; openStudent?: string }>
}) {
  const searchParams = await props.searchParams
  const tab: Tab = searchParams.tab === 'groups' ? 'groups' : 'students'
  const isActive = searchParams.status !== 'inactive'
  const q = searchParams.q ?? ''
  const openStudentParsed = z.string().uuid().safeParse(searchParams.openStudent)

  const { orgId, role, profileId } = await getSession()
  const isTeacher = role === 'teacher'
  const t = await getTranslations('students')
  const tCommon = await getTranslations('common')
  const showWeeklyQuota = await orgEnforcesWeeklyQuota(orgId)

  if (isTeacher && tab === 'groups') {
    redirect('/students')
  }

  const teacherRecord =
    isTeacher ? await getTeacherByProfileId(profileId, orgId, { activeOnly: true }) : null
  if (isTeacher && !teacherRecord) {
    return (
      <div className="text-center mt-16 text-sm text-muted-foreground">
        {t('noTeacherRecord')}
      </div>
    )
  }

  const studentQuery = {
    search: q,
    isActive,
    ...(isTeacher && teacherRecord ? { teacherId: teacherRecord.id } : {}),
  }

  const [students, teachers, groups, initialSheetStudent] = await Promise.all([
    getStudents(orgId, studentQuery),
    isTeacher ? Promise.resolve([]) : getTeachers(orgId),
    tab === 'groups' ? getGroups(orgId) : Promise.resolve([]),
    tab === 'students' && openStudentParsed.success
      ? getStudentById(openStudentParsed.data, orgId)
      : Promise.resolve(null),
  ])

  // For the group form we always need the full active student list
  const allActiveStudents = isActive && tab === 'groups'
    ? students
    : tab === 'groups'
      ? await getStudents(orgId, { isActive: true })
      : students

  const activeTeachers = teachers
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, full_name: t.profile.full_name }))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        actions={
          isTeacher
            ? undefined
            : tab === 'groups'
              ? <NewGroupSheet students={allActiveStudents} action={createGroup} />
              : (
                  <div className="flex items-center gap-2">
                    <Link href="/students/import">
                      <Button variant="outline" size="sm">
                        <Upload size={14} className="ml-1.5" />
                        {tCommon('actions.import')}
                      </Button>
                    </Link>
                    <NewStudentSheet action={createStudent} teachers={activeTeachers} showWeeklyQuota={showWeeklyQuota} />
                  </div>
                )
        }
      />

      {/* Tab bar */}
      {!isTeacher ? (
        <div className="flex gap-1 mb-4 border-b border-border">
          <Link
            href="/students?tab=students"
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === 'students'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <GraduationCap size={15} />
            {t('title')}
          </Link>
          <Link
            href="/students?tab=groups"
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === 'groups'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Users size={15} />
            {t('groups.tab')}
          </Link>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'students' && (
          <>
            <StudentSearch q={q} isActive={isActive} />

            {students.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={GraduationCap}
                  title={q ? tCommon('emptyStates.noResults') : t('title')}
                  // Say what was searched for, and offer the way out — a bare
                  // "no results" leaves you wondering whether the filter or the
                  // data is at fault.
                  subtitle={
                    q
                      ? t('noSearchMatch', { query: q })
                      : !isTeacher
                        ? t('newStudent')
                        : undefined
                  }
                  action={
                    q ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href="/students">{tCommon('actions.clear')}</Link>
                      </Button>
                    ) : !isTeacher ? (
                      <NewStudentSheet action={createStudent} teachers={activeTeachers} showWeeklyQuota={showWeeklyQuota} />
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <StudentsTable
                students={students}
                teachers={activeTeachers}
                tStudent={tCommon('table.student')}
                tGrade={t('fields.grade')}
                tStatus={tCommon('table.status')}
                initialSheetStudent={initialSheetStudent}
                canManage={role === 'owner' || role === 'admin'}
                sheetVariant={isTeacher ? 'teacher' : 'admin'}
                showArchiveActions={!isTeacher}
                showWeeklyQuota={showWeeklyQuota}
              />
            )}
          </>
        )}

        {tab === 'groups' && (
          <GroupsTable groups={groups} students={allActiveStudents} />
        )}
      </div>
    </div>
  )
}
