'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | null

export async function createStudent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const full_name = (formData.get('full_name') as string).trim()
  const grade = (formData.get('grade') as string).trim() || null
  const notes = (formData.get('notes') as string).trim() || null

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }

  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .insert({ organization_id: orgId, full_name, grade, notes })

  if (error) return { error: 'שגיאה ביצירת התלמיד' }

  redirect('/students')
}

export async function updateStudent(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const full_name = (formData.get('full_name') as string).trim()
  const grade = (formData.get('grade') as string).trim() || null
  const notes = (formData.get('notes') as string).trim() || null

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }

  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .update({ full_name, grade, notes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: 'שגיאה בעדכון התלמיד' }

  redirect('/students')
}

export async function archiveStudent(id: string): Promise<void> {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()

  await supabase
    .from('students')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/students')
}

export async function restoreStudent(id: string): Promise<void> {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()

  await supabase
    .from('students')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/students')
}
