'use server'

/**
 * Holiday management server actions — owner/admin only.
 * Per /docs/sprint-10-scope.md § Story 2.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'

export type HolidayActionState = { error: string } | null

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין'),
  name: z.string().min(1, 'שם החג הוא שדה חובה').max(100, 'שם החג ארוך מדי'),
})

const holidayRangeSchema = z
  .object({
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך התחלה לא תקין'),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך סיום לא תקין'),
    name: z.string().min(1, 'שם החופשה הוא שדה חובה').max(100, 'שם החופשה ארוך מדי'),
  })
  .refine((d) => d.date_from <= d.date_to, { message: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה' })
  .refine(
    (d) => {
      const from = new Date(d.date_from)
      const to = new Date(d.date_to)
      const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
      return diffDays <= 60
    },
    { message: 'הטווח המקסימלי הוא 60 ימים' }
  )

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(from)
  const end = new Date(to)
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

export async function addHoliday(
  _prevState: HolidayActionState,
  formData: FormData
): Promise<HolidayActionState> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

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

export async function addHolidayRange(
  _prevState: HolidayActionState,
  formData: FormData
): Promise<HolidayActionState> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const parsed = holidayRangeSchema.safeParse({
    date_from: (formData.get('date_from') as string)?.trim(),
    date_to: (formData.get('date_to') as string)?.trim(),
    name: (formData.get('name') as string)?.trim(),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const dates = getDatesInRange(parsed.data.date_from, parsed.data.date_to)
  const rows = dates.map((d) => ({ organization_id: orgId, date: d, name: parsed.data.name }))

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_holidays')
    .upsert(rows, { onConflict: 'organization_id,date', ignoreDuplicates: true })

  if (error) {
    return { error: 'שגיאה בשמירת הטווח' }
  }

  revalidatePath('/settings/holidays')
  return null
}

export async function deleteHoliday(id: string): Promise<void> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()
  await supabase
    .from('organization_holidays')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/settings/holidays')
}
