import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getCurrentDayStr } from '@/lib/lessons'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { NewLessonForm } from '@/components/dashboard/lessons/NewLessonForm'
import { createTeacherLessonAction } from './actions'
import { getOrgLessonDurations } from '@/lib/organizations/lessonDurations'
import { getRecommendedLessonSlotsAction } from '@/app/(dashboard)/lessons/new/recommended-slots'

export default async function TeacherNewLessonPage() {
  const { orgId, profileId, role } = await getSession()
  const t = await getTranslations('teacherSelf.newLesson')
  if (role !== 'teacher') redirect('/teacher/schedule')

  const teacher = await getTeacherByProfileId(profileId, orgId)
  if (!teacher) redirect('/teacher/schedule')

  // Only show students assigned to this teacher
  const [students, timezone, durations] = await Promise.all([
    getStudents(orgId, { teacherId: teacher.id }),
    getOrgTimezone(orgId),
    getOrgLessonDurations(orgId, 'teacher'),
  ])
  const activeStudents = students.map((s) => ({ id: s.id, full_name: s.full_name }))
  const todayStr = getCurrentDayStr(timezone)

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>
      <NewLessonForm
        students={activeStudents}
        fixedTeacherId={teacher.id}
        allowGroupLessons={false}
        action={createTeacherLessonAction}
        getRecommendedSlots={getRecommendedLessonSlotsAction}
        minDateStr={todayStr}
        durationValues={durations.map((item) => item.minutes)}
      />
    </div>
  )
}
