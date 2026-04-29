'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getTeacherById, type Teacher } from '@/lib/teachers'

type ActionState = { error: string } | null

/**
 * Invite flow (Decision #12):
 * 1. Send Supabase Auth invite via admin API (creates auth.users entry)
 * 2. Create profiles record with the returned user ID
 * 3. Create teachers record linked to that profile
 * All writes use service role — profile creation requires bypassing RLS.
 */
export async function inviteTeacher(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = (formData.get('email') as string).trim().toLowerCase()
  const full_name = (formData.get('full_name') as string).trim()

  if (!email) return { error: 'אימייל הוא שדה חובה' }
  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }

  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }
  const adminClient = createServiceRoleClient()

  // Step 1: Send invite email via Supabase Auth admin API
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email)

  if (inviteError) {
    if (inviteError.message.includes('already been registered')) {
      return { error: 'כתובת אימייל זו כבר רשומה במערכת' }
    }
    return { error: `שגיאה בשליחת ההזמנה: ${inviteError.message}` }
  }

  const userId = inviteData.user.id

  // Step 2: Create profile record
  const { error: profileError } = await adminClient.from('profiles').insert({
    id: userId,
    organization_id: orgId,
    full_name,
    role: 'teacher',
  })

  if (profileError) {
    return { error: 'שגיאה ביצירת פרופיל המורה' }
  }

  // Step 3: Create teacher record linked to profile
  const { error: teacherError } = await adminClient.from('teachers').insert({
    organization_id: orgId,
    profile_id: userId,
  })

  if (teacherError) {
    return { error: 'שגיאה ביצירת רשומת המורה' }
  }

  redirect('/teachers')
}

export async function updateTeacher(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const bio = (formData.get('bio') as string).trim() || null
  const hourlyRateRaw = (formData.get('hourly_rate') as string).trim()
  const hourly_rate = hourlyRateRaw ? parseFloat(hourlyRateRaw) : null

  if (hourlyRateRaw && (isNaN(hourly_rate!) || hourly_rate! < 0)) {
    return { error: 'תעריף שעתי חייב להיות מספר חיובי' }
  }

  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('teachers')
    .update({ bio, hourly_rate, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: 'שגיאה בעדכון המורה' }

  revalidatePath('/teachers')
  revalidatePath(`/teachers/${id}/edit`)

  return null
}

export async function fetchTeacherForSheet(
  id: string
): Promise<{ data: Teacher } | { error: string }> {
  const { orgId } = await getSession()
  const teacher = await getTeacherById(id, orgId)
  if (!teacher) return { error: 'המורה לא נמצא' }
  return { data: teacher }
}

export async function archiveTeacher(id: string): Promise<void> {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()

  await supabase
    .from('teachers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/teachers')
  revalidatePath(`/teachers/${id}/edit`)
}

export async function restoreTeacher(id: string): Promise<void> {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()

  await supabase
    .from('teachers')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/teachers')
  revalidatePath(`/teachers/${id}/edit`)
}
