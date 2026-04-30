'use server'

/**
 * Teacher self-service override actions.
 * teacherId is always resolved from the authenticated session — never from the request.
 * Per /docs/sprint-10-scope.md § Story 5.
 */

import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | null

export async function addTeacherOverride(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)

  if (role !== 'teacher') return { error: 'אין הרשאה' }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return { error: 'לא נמצאה רשומת מורה פעילה' }

  const override_date = (formData.get('override_date') as string).trim()
  const type = formData.get('type') as string // 'block' | 'available'
  const start_time = (formData.get('start_time') as string | null)?.trim() || null
  const end_time = (formData.get('end_time') as string | null)?.trim() || null
  const reason = (formData.get('reason') as string).trim() || null

  if (!override_date) return { error: 'יש לבחור תאריך' }

  const is_available = type === 'available'

  if (is_available) {
    if (!start_time || !end_time) return { error: 'יש למלא שעת התחלה ושעת סיום' }
    if (start_time >= end_time) return { error: 'שעת הסיום חייבת להיות לאחר שעת ההתחלה' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('availability_overrides').insert({
    organization_id: orgId,
    teacher_id: teacher.id,   // always from session
    override_date,
    is_available,
    start_time: is_available ? start_time : null,
    end_time: is_available ? end_time : null,
    reason,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'כבר קיים חריג לתאריך זה' }
    }
    return { error: 'שגיאה בשמירת החריג' }
  }

  revalidatePath('/teacher/overrides')
  return null
}

export async function deleteTeacherOverride(id: string): Promise<void> {
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)
  if (role !== 'teacher') return

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return

  const supabase = await createClient()
  // Security: scoped to own teacher record + org
  await supabase
    .from('availability_overrides')
    .delete()
    .eq('id', id)
    .eq('teacher_id', teacher.id)
    .eq('organization_id', orgId)

  revalidatePath('/teacher/overrides')
}
