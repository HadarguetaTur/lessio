import { redirect } from 'next/navigation'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { getGroups } from '@/lib/groups'
import { getOrgTimezone } from '@/lib/organizations'
import { LESSON_FORM_MIN_DATE_STR } from '@/lib/lessons/lessonFormDates'
import { NewLessonForm } from '@/components/dashboard/lessons/NewLessonForm'
import { createLessonAction } from './actions'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

export default async function NewLessonPage(props: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await props.searchParams
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/lessons')

  const [teachers, students, groups, timezone] = await Promise.all([
    getTeachers(orgId),
    getStudents(orgId),
    getGroups(orgId),
    getOrgTimezone(orgId),
  ])

  const activeTeachers = teachers
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, full_name: t.profile.full_name }))

  const activeStudents = students
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, full_name: s.full_name }))

  const t = await getTranslations('lessons')

  const now = DateTime.now().setZone(timezone)
  const todayStr = now.toFormat('yyyy-MM-dd')
  // Next round half hour in the org's timezone, e.g. 14:12 → 14:30.
  const nextHalfHour = now
    .plus({ minutes: 30 - (now.minute % 30) })
    .toFormat('HH:mm')

  const dateParsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(dateParam)
  const initialDate =
    dateParsed.success && dateParsed.data >= LESSON_FORM_MIN_DATE_STR
      ? dateParsed.data
      : todayStr

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('newLesson')}</h1>
      <NewLessonForm
        teachers={activeTeachers}
        students={activeStudents}
        groups={groups}
        action={createLessonAction}
        minDateStr={LESSON_FORM_MIN_DATE_STR}
        initialDate={initialDate}
        initialTime={nextHalfHour}
      />
    </div>
  )
}
