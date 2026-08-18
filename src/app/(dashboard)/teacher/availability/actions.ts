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
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

type ActionState = { error: string } | null

export async function addTeacherAvailability(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)

  if (role !== 'teacher') return { error: await commonError('noPermission') }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return { error: t('teacherSelf.errors.noTeacherRecord') }

  const day_of_week = parseInt(formData.get('day_of_week') as string, 10)
  const start_time = (formData.get('start_time') as string).trim()
  const end_time = (formData.get('end_time') as string).trim()

  if (isNaN(day_of_week) || day_of_week < 0 || day_of_week > 6) {
    return { error: t('teacherSelf.errors.pickDay') }
  }
  if (!start_time || !end_time) {
    return { error: t('teacherSelf.errors.fillTimes') }
  }
  if (start_time >= end_time) {
    return { error: t('teacherSelf.errors.endAfterStart') }
  }

  const existing = await getTeacherAvailabilityByDay(teacher.id, orgId, day_of_week)
  if (hasOverlap(start_time, end_time, existing)) {
    return { error: t('teacherSelf.errors.overlapping') }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('availability').insert({
    organization_id: orgId,
    teacher_id: teacher.id,
    day_of_week,
    start_time,
    end_time,
  })

  if (error) return { error: t('teacherSelf.errors.saveAvailabilityFailed') }

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
