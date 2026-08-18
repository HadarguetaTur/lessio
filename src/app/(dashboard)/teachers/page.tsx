import { UserRound, Upload } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { inviteTeacher, updateTeacher, archiveTeacher, restoreTeacher } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { TeachersTable } from '@/components/dashboard/teachers/TeachersTable'
import { NewTeacherSheet } from '@/components/dashboard/teachers/TeacherSheet'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function TeachersPage() {
  const { orgId, role } = await getSession()
  const teachers = await getTeachers(orgId)
  const t = await getTranslations('teachers')
  const tCommon = await getTranslations('common')
  const tStudents = await getTranslations('students')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/teachers/import">
              <Button variant="outline" size="sm">
                <Upload size={14} className="ml-1.5" />
                {t('importPage.importLabel')}
              </Button>
            </Link>
            <NewTeacherSheet action={inviteTeacher} />
          </div>
        }
      />

      {teachers.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={t('title')}
          subtitle={t('invite')}
          action={<NewTeacherSheet action={inviteTeacher} />}
        />
      ) : (
        <TeachersTable
          teachers={teachers}
          role={role as 'owner' | 'admin' | 'teacher'}
          headingName={tCommon('table.teacher')}
          headingBio={t('bio')}
          headingStatus={tCommon('table.status')}
          statusActiveLabel={tStudents('status.active')}
          statusInactiveLabel={tStudents('status.inactive')}
          updateAction={updateTeacher}
          archiveAction={archiveTeacher}
          restoreAction={restoreTeacher}
        />
      )}
    </div>
  )
}
