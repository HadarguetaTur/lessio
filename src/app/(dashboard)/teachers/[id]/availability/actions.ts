'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherAvailabilityByDay, hasOverlap } from '@/lib/availability'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | null

export async function createAvailability(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }

  // Overlap validation (non-negotiable per sprint-2-scope.md)
  const existing = await getTeacherAvailabilityByDay(teacherId, orgId, day_of_week)
  if (hasOverlap(start_time, end_time, existing)) {
    return { error: 'חלון הזמן חופף עם זמינות קיימת באותו יום' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('availability').insert({
    organization_id: orgId,
    teacher_id: teacherId,
    day_of_week,
    start_time,
    end_time,
  })

  if (error) return { error: 'שגיאה בשמירת הזמינות' }

  revalidatePath(`/teachers/${teacherId}/availability`)
  return null
}

export async function deleteAvailability(id: string, teacherId: string): Promise<void> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return
  const supabase = await createClient()

  await supabase
    .from('availability')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath(`/teachers/${teacherId}/availability`)
}
