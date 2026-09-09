'use server'

import { DateTime } from 'luxon'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getAvailableSlots } from '@/lib/booking'
import { getOrgTimezone } from '@/lib/organizations'
import { isLessonDurationAllowed } from '@/lib/organizations/lessonDurations'

export interface RecommendedLessonSlot {
  startTime: string
  endTime: string
}

const RequestSchema = z.object({
  teacherId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(5).max(480),
})

/** The same availability engine used by the parent/bot booking flow. */
export async function getRecommendedLessonSlotsAction(
  teacherId: string,
  date: string,
  durationMinutes: number
): Promise<RecommendedLessonSlot[]> {
  const session = await getSession()
  const parsed = RequestSchema.safeParse({ teacherId, date, durationMinutes })
  if (!parsed.success) return []

  if (session.role === 'teacher') {
    const ownTeacher = await getTeacherByProfileId(session.profileId, session.orgId, {
      activeOnly: true,
    })
    if (!ownTeacher || ownTeacher.id !== parsed.data.teacherId) return []
  } else if (session.role !== 'owner' && session.role !== 'admin') {
    return []
  }

  // A duration the org closed for this audience must not produce slots — the
  // create action would reject it anyway, so never tempt the user with them.
  const audience = session.role === 'teacher' ? 'teacher' : 'admin'
  if (!(await isLessonDurationAllowed(session.orgId, audience, parsed.data.durationMinutes))) {
    return []
  }

  const [slots, timezone] = await Promise.all([
    getAvailableSlots({
      teacherId: parsed.data.teacherId,
      date: parsed.data.date,
      durationMinutes: parsed.data.durationMinutes,
      organizationId: session.orgId,
    }),
    getOrgTimezone(session.orgId),
  ])

  return slots.map((slot) => ({
    startTime: DateTime.fromISO(slot.startAt, { zone: 'utc' }).setZone(timezone).toFormat('HH:mm'),
    endTime: DateTime.fromISO(slot.endAt, { zone: 'utc' }).setZone(timezone).toFormat('HH:mm'),
  }))
}
