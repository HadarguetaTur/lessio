'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | null

export async function createParent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const full_name = (formData.get('full_name') as string).trim()
  const rawPhone = (formData.get('phone') as string).trim()
  const notes = (formData.get('notes') as string).trim() || null

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }
  if (!rawPhone) return { error: 'מספר טלפון הוא שדה חובה' }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: 'מספר טלפון לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
    }
    return { error: 'שגיאה בעיבוד מספר הטלפון' }
  }

  const { orgId } = await getSession()
  const supabase = await createClient()

  const { error } = await supabase
    .from('parents')
    .insert({ organization_id: orgId, full_name, phone, notes })

  if (error) {
    if (error.code === '23505') {
      return { error: 'מספר טלפון זה כבר קיים במערכת' }
    }
    return { error: 'שגיאה ביצירת ההורה' }
  }

  redirect('/parents')
}

export async function updateParent(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const full_name = (formData.get('full_name') as string).trim()
  const rawPhone = (formData.get('phone') as string).trim()
  const notes = (formData.get('notes') as string).trim() || null

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }
  if (!rawPhone) return { error: 'מספר טלפון הוא שדה חובה' }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: 'מספר טלפון לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
    }
    return { error: 'שגיאה בעיבוד מספר הטלפון' }
  }

  const { orgId } = await getSession()
  const supabase = await createClient()

  const { error } = await supabase
    .from('parents')
    .update({ full_name, phone, notes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) {
    if (error.code === '23505') {
      return { error: 'מספר טלפון זה כבר קיים במערכת' }
    }
    return { error: 'שגיאה בעדכון ההורה' }
  }

  redirect('/parents')
}

export async function archiveParent(id: string): Promise<void> {
  const { orgId } = await getSession()
  const supabase = await createClient()

  await supabase
    .from('parents')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/parents')
}

export async function restoreParent(id: string): Promise<void> {
  const { orgId } = await getSession()
  const supabase = await createClient()

  await supabase
    .from('parents')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/parents')
}
