'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | { success: true } | null

export async function updateCancellationPolicy(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    return { error: 'רק בעל העסק יכול לעדכן את מדיניות הביטולים' }
  }

  const notice_hours_full = parseInt(formData.get('notice_hours_full') as string, 10)
  const notice_hours_partial = parseInt(formData.get('notice_hours_partial') as string, 10)
  const partial_charge_percent = parseInt(formData.get('partial_charge_percent') as string, 10)

  if (isNaN(notice_hours_full) || notice_hours_full < 0) {
    return { error: 'שעות הודעה מוקדמת (ביטול מלא) חייבות להיות מספר חיובי' }
  }
  if (isNaN(notice_hours_partial) || notice_hours_partial < 0) {
    return { error: 'שעות הודעה מוקדמת (ביטול חלקי) חייבות להיות מספר חיובי' }
  }
  if (notice_hours_partial >= notice_hours_full) {
    return { error: 'סף ביטול חלקי חייב להיות קטן מסף ביטול מלא' }
  }
  if (isNaN(partial_charge_percent) || partial_charge_percent < 0 || partial_charge_percent > 100) {
    return { error: 'אחוז חיוב חלקי חייב להיות בין 0 ל-100' }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('cancellation_policies').upsert(
    {
      organization_id: orgId,
      notice_hours_full,
      notice_hours_partial,
      partial_charge_percent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) return { error: 'שגיאה בשמירת המדיניות' }

  revalidatePath('/settings/cancellation-policy')
  return { success: true }
}
