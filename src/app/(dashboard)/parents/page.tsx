import { Users, Upload } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getParents } from '@/lib/parents'
import { getTeacherByProfileId } from '@/lib/teachers'
import { ParentSearch } from '@/components/dashboard/parents/ParentSearch'
import { createParent, updateParent, archiveParent, restoreParent, sendPaymentRequestAction } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ParentsTable } from '@/components/dashboard/parents/ParentsTable'
import { NewParentSheet } from '@/components/dashboard/parents/ParentSheet'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function ParentsPage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const searchParams = await props.searchParams
  const q = searchParams.q ?? ''

  const { orgId, role, profileId } = await getSession()
  const isTeacher = role === 'teacher'
  const t = await getTranslations('parents')
  const tCommon = await getTranslations('common')
  const tStudents = await getTranslations('students')

  // Same shape as the students page: a teacher sees her own families only.
  const teacherRecord =
    isTeacher ? await getTeacherByProfileId(profileId, orgId, { activeOnly: true }) : null
  if (isTeacher && !teacherRecord) {
    return (
      <div className="text-center mt-16 text-sm text-muted-foreground">
        {tStudents('noTeacherRecord')}
      </div>
    )
  }

  const parents = await getParents(orgId, {
    search: q,
    ...(isTeacher && teacherRecord ? { teacherId: teacherRecord.id } : {}),
  })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        actions={
          !isTeacher ? (
            <div className="flex items-center gap-2">
              <Link href="/parents/import">
                <Button variant="outline" size="sm">
                  <Upload size={14} className="ml-1.5" />
                  {t('importLabel')}
                </Button>
              </Link>
              <NewParentSheet action={createParent} />
            </div>
          ) : undefined
        }
      />

      <ParentSearch q={q} />

      {parents.length === 0 ? (
        <div className="mt-4">
          {/* Title and subtitle used to be the page title and a button label
              ("הורים" / "הורה חדש") — an empty state that said what the page is
              called, not what it is for or why it is empty (UX audit F17). */}
          <EmptyState
            icon={Users}
            title={
              q
                ? tCommon('emptyStates.noResults')
                : isTeacher
                  ? t('emptyTeacher')
                  : t('emptyTitle')
            }
            subtitle={q ? t('noSearchMatch', { query: q }) : isTeacher ? undefined : t('emptySubtitle')}
            action={
              q ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/parents">{tCommon('actions.clear')}</Link>
                </Button>
              ) : !isTeacher ? (
                <NewParentSheet action={createParent} />
              ) : undefined
            }
          />
        </div>
      ) : (
        <ParentsTable
          parents={parents}
          role={role as 'owner' | 'admin' | 'teacher'}
          headingName={t('title')}
          headingPhone={tCommon('table.phone')}
          headingStatus={tCommon('table.status')}
          statusActiveLabel={t('statusActive')}
          statusInactiveLabel={t('statusInactive')}
          updateAction={updateParent}
          archiveAction={archiveParent}
          restoreAction={restoreParent}
          paymentAction={sendPaymentRequestAction}
        />
      )}
    </div>
  )
}
