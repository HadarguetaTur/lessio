import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getTeacherAvailability, normalizeTime } from '@/lib/availability'
import { getEffectiveBreakMinutes } from '@/lib/scheduling/breaks'
import { getTailPromptsForPage } from '@/lib/scheduling/tailPrompts'
import { WeeklyAvailabilityEditor } from '@/components/dashboard/availability/WeeklyAvailabilityEditor'
import { BreakSettingCard } from '@/components/dashboard/availability/BreakSettingCard'
import { TailPromptCard } from '@/components/dashboard/availability/TailPromptCard'
import {
  addTeacherAvailability,
  blockOwnTail,
  deleteTeacherAvailability,
  dismissOwnTail,
  extendOwnTail,
  saveOwnBreakDuration,
  updateTeacherAvailability,
} from './actions'

export default async function TeacherAvailabilityPage() {
  const { userId, orgId, role, isSupportMode } = await getSession()
  const t = await getTranslations('teacherSelf.availability')
  const tSelf = await getTranslations('teacherSelf')

  // Not teacher-only: an owner/admin who also teaches has no other route to
  // their own grid — a solo tutor's sidebar hides the teachers section
  // entirely. The teacher row still comes from the session below.
  if (role !== 'teacher' && role !== 'owner' && role !== 'admin') {
    redirect('/dashboard')
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    if (role !== 'teacher') redirect('/dashboard')
    return (
      <div className="text-center mt-16 text-sm text-muted-foreground">
        {tSelf('noTeacherRecordContact')}
      </div>
    )
  }

  const [windows, { orgBreak, teacherBreak }, tailPrompts] = await Promise.all([
    getTeacherAvailability(teacher.id, orgId),
    getEffectiveBreakMinutes(orgId, teacher.id),
    getTailPromptsForPage({ orgId, teacherId: teacher.id }),
  ])

  return (
    <div className="max-w-2xl pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{tSelf('availabilityHint')}</p>
      </div>

      <TailPromptCard
        prompts={tailPrompts}
        blockAction={blockOwnTail}
        extendAction={extendOwnTail}
        dismissAction={dismissOwnTail}
        readOnly={isSupportMode}
      />

      <BreakSettingCard
        value={teacherBreak}
        orgDefault={orgBreak}
        action={saveOwnBreakDuration}
        readOnly={isSupportMode}
      />

      <WeeklyAvailabilityEditor
        windows={windows.map((w) => ({
          id: w.id,
          day_of_week: w.day_of_week,
          start_time: normalizeTime(w.start_time),
          end_time: normalizeTime(w.end_time),
        }))}
        addAction={addTeacherAvailability}
        updateAction={updateTeacherAvailability}
        deleteAction={deleteTeacherAvailability}
        readOnly={isSupportMode}
      />
    </div>
  )
}
