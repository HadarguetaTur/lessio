'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | null

export async function createOverride(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
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

  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }

  const supabase = await createClient()

  const { error } = await supabase.from('availability_overrides').insert({
    organization_id: orgId,
    teacher_id: teacherId,
    override_date,
    is_available,
    start_time: is_available ? start_time : null,
    end_time: is_available ? end_time : null,
    reason,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'כבר קיים חריג לתאריך זה עבור מורה זה' }
    }
    return { error: 'שגיאה בשמירת החריג' }
  }

  revalidatePath(`/teachers/${teacherId}/overrides`)
  return null
}

export async function deleteOverride(id: string, teacherId: string): Promise<void> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return
  const supabase = await createClient()

  await supabase
    .from('availability_overrides')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath(`/teachers/${teacherId}/overrides`)
}
