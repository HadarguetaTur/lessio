'use server'

/**
 * Teacher self-service availability actions.
 * teacherId is always resolved from the authenticated session — never from the request.
 * Per /docs/sprint-10-scope.md § Story 4.
 */

import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getTeacherAvailabilityByDay, hasOverlap } from '@/lib/availability'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | null

export async function addTeacherAvailability(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)

  if (role !== 'teacher') return { error: 'אין הרשאה' }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return { error: 'לא נמצאה רשומת מורה פעילה' }

  const day_of_week = parseInt(formData.get('day_of_week') as string, 10)
  const start_time = (formData.get('start_time') as string).trim()
  const end_time = (formData.get('end_time') as string).trim()

  if (isNaN(day_of_week) || day_of_week < 0 || day_of_week > 6) {
    return { error: 'יש לבחור יום' }
  }
  if (!start_time || !end_time) {
    return { error: 'יש למלא שעת התחלה ושעת סיום' }
  }
  if (start_time >= end_time) {
    return { error: 'שעת הסיום חייבת להיות לאחר שעת ההתחלה' }
  }

  const existing = await getTeacherAvailabilityByDay(teacher.id, orgId, day_of_week)
  if (hasOverlap(start_time, end_time, existing)) {
    return { error: 'חלון הזמן חופף עם זמינות קיימת באותו יום' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('availability').insert({
    organization_id: orgId,
    teacher_id: teacher.id,
    day_of_week,
    start_time,
    end_time,
  })

  if (error) return { error: 'שגיאה בשמירת הזמינות' }

  revalidatePath('/teacher/availability')
  return null
}

export async function deleteTeacherAvailability(id: string): Promise<void> {
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)
  if (role !== 'teacher') return

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return

  const supabase = await createClient()
  // Security: scoped to own teacher record + org
  await supabase
    .from('availability')
    .delete()
    .eq('id', id)
    .eq('teacher_id', teacher.id)
    .eq('organization_id', orgId)

  revalidatePath('/teacher/availability')
}
