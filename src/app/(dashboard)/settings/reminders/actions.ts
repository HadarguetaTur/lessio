'use server'

/**
 * Server actions for reminder settings.
 * Owner-only. Per /docs/sprint-12-scope.md § Story 2.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type ReminderActionState = {
  error: string | null
  success?: boolean
}

const RemindersSchema = z.object({
  reminders_enabled: z.boolean(),
  lesson_reminder_hours: z.coerce
    .number()
    .refine((v) => [2, 4, 12, 24, 48].includes(v), {
      message: 'ערך שעות לא חוקי',
    }),
  payment_reminder_days: z.coerce.number().int().min(1).max(30),
})

export async function saveReminderSettings(
  _prevState: ReminderActionState,
  formData: FormData
): Promise<ReminderActionState> {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const raw = {
    reminders_enabled: formData.get('reminders_enabled') === 'on',
    lesson_reminder_hours: formData.get('lesson_reminder_hours'),
    payment_reminder_days: formData.get('payment_reminder_days'),
  }

  const parsed = RemindersSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({
      reminders_enabled: parsed.data.reminders_enabled,
      lesson_reminder_hours: parsed.data.lesson_reminder_hours,
      payment_reminder_days: parsed.data.payment_reminder_days,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[reminders/settings] DB update failed', {
      orgId,
      error: updateError.message,
    })
    return { error: 'שגיאה בשמירת ההגדרות' }
  }

  console.info('[reminders/settings] Reminder settings saved', {
    orgId,
    ...parsed.data,
  })
  revalidatePath('/settings/reminders')
  return { error: null, success: true }
}
