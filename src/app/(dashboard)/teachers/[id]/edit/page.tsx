import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeacherById } from '@/lib/teachers'
import { TeacherDetailPanel } from '@/components/dashboard/teachers/TeacherDetailPanel'
import { updateTeacher, archiveTeacher, restoreTeacher } from '../../actions'
import { getTranslations } from 'next-intl/server'

export default async function EditTeacherPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId, role } = await getSession()

  const teacher = await getTeacherById(id, orgId)
  if (!teacher) notFound()

  const boundUpdateTeacher = updateTeacher.bind(null, teacher.id)
  const archiveAction = archiveTeacher.bind(null, teacher.id)
  const restoreAction = restoreTeacher.bind(null, teacher.id)
  const canMutate = role === 'owner' || role === 'admin'

  const t = await getTranslations('teachers')

  return (
    <div className="max-w-2xl space-y-6 pb-8 min-w-0">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground min-w-0" aria-label="Breadcrumb">
        <Link href="/teachers" className="hover:text-foreground shrink-0">
          {t('title')}
        </Link>
        <ArrowRight size={14} className="shrink-0 rotate-180 opacity-60" aria-hidden />
        <span className="text-foreground font-medium truncate">{teacher.profile.full_name}</span>
      </nav>

      <TeacherDetailPanel
        teacher={teacher}
        updateAction={boundUpdateTeacher}
        archiveAction={archiveAction}
        restoreAction={restoreAction}
        canMutate={canMutate}
      />
    </div>
  )
}
