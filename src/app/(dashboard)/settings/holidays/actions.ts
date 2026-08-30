'use server'

/**
 * Holiday management server actions — owner/admin only.
 * Per /docs/sprint-10-scope.md § Story 2.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export type HolidayActionState = { error: string } | null

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.invalidDate'),
  name: z.string().min(1, 'validation.holidayNameRequired').max(100, 'validation.holidayNameTooLong'),
})

const holidayRangeSchema = z
  .object({
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.invalidStartDate'),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.invalidEndDate'),
    name: z.string().min(1, 'validation.vacationNameRequired').max(100, 'validation.vacationNameTooLong'),
  })
  .refine((d) => d.date_from <= d.date_to, { message: 'validation.endAfterStart' })
  .refine(
    (d) => {
      const from = new Date(d.date_from)
      const to = new Date(d.date_to)
      const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
      return diffDays <= 60
    },
    { message: 'validation.maxRange60Days' }
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
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const parsed = holidaySchema.safeParse({
    date: (formData.get('date') as string)?.trim(),
    name: (formData.get('name') as string)?.trim(),
  })

  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_holidays')
    .insert({ organization_id: orgId, date: parsed.data.date, name: parsed.data.name })

  if (error) {
    if (error.code === '23505') {
      return { error: t('settings.holidaysActions.errors.duplicateDate') }
    }
    return { error: t('settings.holidaysActions.errors.saveHolidayFailed') }
  }

  revalidatePath('/settings/holidays')
  return null
}

export async function addHolidayRange(
  _prevState: HolidayActionState,
  formData: FormData
): Promise<HolidayActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const parsed = holidayRangeSchema.safeParse({
    date_from: (formData.get('date_from') as string)?.trim(),
    date_to: (formData.get('date_to') as string)?.trim(),
    name: (formData.get('name') as string)?.trim(),
  })

  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const dates = getDatesInRange(parsed.data.date_from, parsed.data.date_to)
  const rows = dates.map((d) => ({ organization_id: orgId, date: d, name: parsed.data.name }))

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_holidays')
    .upsert(rows, { onConflict: 'organization_id,date', ignoreDuplicates: true })

  if (error) {
    return { error: t('settings.holidaysActions.errors.saveRangeFailed') }
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

  const { data: holiday } = await supabase
    .from('organization_holidays')
    .select('source, date')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!holiday) return

  // Deleting an auto-populated holiday dismisses its date so future syncs
  // never resurrect it. Recorded before the delete: if the delete fails the
  // row stays visible and the user retries; the reverse order risks the
  // holiday reappearing on the next sync.
  if (holiday.source === 'auto') {
    const { error: dismissError } = await supabase
      .from('organization_holiday_dismissals')
      .upsert(
        { organization_id: orgId, date: holiday.date },
        { onConflict: 'organization_id,date', ignoreDuplicates: true }
      )
    if (dismissError) {
      console.error('[deleteHoliday] dismissal upsert failed', { orgId, id, error: dismissError })
      return
    }
  }

  await supabase
    .from('organization_holidays')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/settings/holidays')
}
