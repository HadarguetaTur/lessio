import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTeacherById } from '@/lib/teachers'
import { TeacherEditForm } from '@/components/dashboard/teachers/TeacherEditForm'
import { updateTeacher } from '../../actions'
import { getTranslations } from 'next-intl/server'

export default async function EditTeacherPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const teacher = await getTeacherById(id, orgId)
  if (!teacher) notFound()

  const boundUpdateTeacher = updateTeacher.bind(null, teacher.id)

  const t = await getTranslations('teachers')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('editTeacher')}</h1>
      <p className="text-sm text-gray-500 mb-6">{teacher.profile.full_name}</p>
      <TeacherEditForm action={boundUpdateTeacher} defaultValues={{ bio: teacher.bio, hourly_rate: teacher.hourly_rate }} />
    </div>
  )
}
