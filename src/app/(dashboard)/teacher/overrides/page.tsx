import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getTeacherOverrides } from '@/lib/availability-overrides'
import { OverridesEditor } from '@/components/dashboard/availability/OverridesEditor'
import {
  addTeacherOverride,
  deleteTeacherOverride,
  updateTeacherOverride,
} from './actions'

export default async function TeacherOverridesPage() {
  const { userId, orgId, role, isSupportMode } = await getSession()
  const t = await getTranslations('teacherSelf.overrides')
  const tSelf = await getTranslations('teacherSelf')

  // Not teacher-only: an owner/admin who also teaches reaches their own
  // exceptions here, since a solo tutor's sidebar hides the teachers section.
  // The teacher row is still resolved from the session below.
  if (role !== 'teacher' && role !== 'owner' && role !== 'admin') {
    redirect('/dashboard')
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    // "Ask your manager" is the right message for a teacher, not for the
    // owner who would be that manager.
    if (role !== 'teacher') redirect('/dashboard')
    return (
      <div className="text-center mt-16 text-sm text-muted-foreground">
        {tSelf('noTeacherRecordContact')}
      </div>
    )
  }

  const overrides = await getTeacherOverrides(teacher.id, orgId)

  return (
    <div className="max-w-3xl pb-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{tSelf('overridesHint')}</p>

      <OverridesEditor
        overrides={overrides}
        addAction={addTeacherOverride}
        updateAction={updateTeacherOverride}
        deleteAction={deleteTeacherOverride}
        readOnly={isSupportMode}
      />
    </div>
  )
}
