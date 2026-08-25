import { TeacherInviteForm } from '@/components/dashboard/teachers/TeacherInviteForm'
import { inviteTeacher } from '../actions'
import { getTranslations } from 'next-intl/server'

export default async function InviteTeacherPage() {
  const t = await getTranslations('teachers')
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('invite')}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t('inviteDescription')}
      </p>
      <TeacherInviteForm action={inviteTeacher} />
    </div>
  )
}
