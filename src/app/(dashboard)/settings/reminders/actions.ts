'use server'

/**
 * Server actions for reminder settings.
 * Owner-only. Per /docs/sprint-12-scope.md § Story 2.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export type ReminderActionState = {
  error: string | null
  success?: boolean
}

const EmailNotificationsSchema = z.object({
  lesson_reminder: z.boolean().optional().default(false),
  payment_reminder: z.boolean().optional().default(false),
  homework_assignment: z.boolean().optional().default(false),
  receipt: z.boolean().optional().default(false),
  homework_graded: z.boolean().optional().default(false),
  progress_report: z.boolean().optional().default(false),
})

const RemindersSchema = z.object({
  reminders_enabled: z.boolean(),
  lesson_reminder_hours: z.coerce
    .number()
    .refine((v) => [2, 4, 12, 24, 48].includes(v), {
      message: 'validation.invalidHours',
    }),
  payment_reminder_days: z.coerce.number().int().min(1).max(30),
  email_notifications: EmailNotificationsSchema.optional(),
})

export async function saveReminderSettings(
  _prevState: ReminderActionState,
  formData: FormData
): Promise<ReminderActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  const raw = {
    reminders_enabled: formData.get('reminders_enabled') === 'on',
    lesson_reminder_hours: formData.get('lesson_reminder_hours'),
    payment_reminder_days: formData.get('payment_reminder_days'),
    email_notifications: {
      lesson_reminder: formData.get('email_lesson_reminder') === 'on',
      payment_reminder: formData.get('email_payment_reminder') === 'on',
      homework_assignment: formData.get('email_homework_assignment') === 'on',
      receipt: formData.get('email_receipt') === 'on',
      homework_graded: formData.get('email_homework_graded') === 'on',
      progress_report: formData.get('email_progress_report') === 'on',
    },
  }

  const parsed = RemindersSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({
      reminders_enabled: parsed.data.reminders_enabled,
      lesson_reminder_hours: parsed.data.lesson_reminder_hours,
      payment_reminder_days: parsed.data.payment_reminder_days,
      email_notifications: parsed.data.email_notifications ?? {},
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[reminders/settings] DB update failed', {
      orgId,
      error: updateError.message,
    })
    return { error: t('settings.remindersActions.errors.saveFailed') }
  }

  console.info('[reminders/settings] Reminder settings saved', {
    orgId,
    ...parsed.data,
  })
  revalidatePath('/settings/reminders')
  return { error: null, success: true }
}
