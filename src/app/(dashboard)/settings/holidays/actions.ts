'use server'

/**
 * Holiday management server actions — owner/admin only.
 * Per /docs/sprint-10-scope.md § Story 2.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export type HolidayActionState = { error: string } | null

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין'),
  name: z.string().min(1, 'שם החג הוא שדה חובה').max(100, 'שם החג ארוך מדי'),
})

export async function addHoliday(
  _prevState: HolidayActionState,
  formData: FormData
): Promise<HolidayActionState> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const parsed = holidaySchema.safeParse({
    date: (formData.get('date') as string)?.trim(),
    name: (formData.get('name') as string)?.trim(),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_holidays')
    .insert({ organization_id: orgId, date: parsed.data.date, name: parsed.data.name })

  if (error) {
    if (error.code === '23505') {
      return { error: 'כבר קיים חג בתאריך זה' }
    }
    return { error: 'שגיאה בשמירת החג' }
  }

  revalidatePath('/settings/holidays')
  return null
}

export async function deleteHoliday(id: string): Promise<void> {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()
  await supabase
    .from('organization_holidays')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/settings/holidays')
}
