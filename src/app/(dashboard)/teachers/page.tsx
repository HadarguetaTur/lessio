import { UserRound, Upload } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { inviteTeacher, updateTeacher, archiveTeacher, restoreTeacher } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'
import { NewTeacherSheet, TeacherRowActions } from '@/components/dashboard/teachers/TeacherSheet'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function TeachersPage() {
  const { orgId } = await getSession()
  const teachers = await getTeachers(orgId)
  const t = await getTranslations('teachers')
  const tCommon = await getTranslations('common')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/teachers/import">
              <Button variant="outline" size="sm">
                <Upload size={14} className="ml-1.5" />
                יבוא
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
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-full overflow-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.teacher')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    ביוגרפיה
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.status')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 w-12 bg-muted/95 px-5 backdrop-blur" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => {
                  const updateAction = updateTeacher.bind(null, teacher.id)
                  const archiveAction = archiveTeacher.bind(null, teacher.id)
                  const restoreAction = restoreTeacher.bind(null, teacher.id)
                  return (
                    <TableRow key={teacher.id} className="hover:bg-muted/20">
                      <TableCell className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={teacher.profile.full_name} />
                          <span className="text-sm font-medium text-foreground">
                            {teacher.profile.full_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs px-5 py-3.5 text-sm text-muted-foreground">
                        <div className="truncate">
                          {teacher.bio ?? <span className="text-border">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                            teacher.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          {teacher.is_active ? 'פעיל' : 'לא פעיל'}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <TeacherRowActions
                          teacher={{
                            id: teacher.id,
                            profileName: teacher.profile.full_name,
                            bio: teacher.bio,
                            hourly_rate: teacher.hourly_rate,
                            is_active: teacher.is_active,
                          }}
                          updateAction={updateAction}
                          archiveAction={archiveAction}
                          restoreAction={restoreAction}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
