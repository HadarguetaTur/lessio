import { redirect } from 'next/navigation'
import { DateTime } from 'luxon'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { getGroups } from '@/lib/groups'
import { getOrgTimezone } from '@/lib/organizations'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { LESSON_FORM_MIN_DATE_STR } from '@/lib/lessons/lessonFormDates'
import { NewLessonForm } from '@/components/dashboard/lessons/NewLessonForm'
import { createLessonAction } from './actions'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { getOrgLessonDurations } from '@/lib/organizations/lessonDurations'

export default async function NewLessonPage(props: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await props.searchParams
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/lessons')

  const [teachers, students, groups, timezone, pricing, durations] = await Promise.all([
    getTeachers(orgId),
    getStudents(orgId),
    getGroups(orgId),
    getOrgTimezone(orgId),
    getOrgPricing(orgId),
    getOrgLessonDurations(orgId, 'admin'),
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
  // Next round half hour, clamped to teaching hours: nobody schedules a lesson
  // for 23:30 just because that is when she opened the form. Before 08:00 the
  // default is 08:00 today; after 21:00 it is 08:00 tomorrow (date included).
  let slot = now.plus({ minutes: 30 - (now.minute % 30) })
  if (slot.hour < 8) slot = slot.set({ hour: 8, minute: 0 })
  if (slot.hour >= 21) slot = slot.plus({ days: 1 }).set({ hour: 8, minute: 0 })
  const nextHalfHour = slot.toFormat('HH:mm')
  const defaultDateStr = slot.toFormat('yyyy-MM-dd')

  const dateParsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(dateParam)
  const initialDate =
    dateParsed.success && dateParsed.data >= LESSON_FORM_MIN_DATE_STR
      ? dateParsed.data
      : defaultDateStr

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
        pricingDefaults={{
          pairPricePerStudent: pricing.pairPricePerStudent,
          groupPricePerStudent: pricing.groupPricePerStudent,
        }}
        durationValues={durations.map((item) => item.minutes)}
      />
    </div>
  )
}
