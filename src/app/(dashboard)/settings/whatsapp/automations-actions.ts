'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, mutationBlockedError, zodError } from '@/lib/i18n/actionErrors'
import { requireFeature, assertFeature, FeatureNotAvailableError } from '@/lib/saas/featureGate'
import { getTranslations } from 'next-intl/server'

const Schema = z.object({
  automation_lesson_reminder_enabled:   z.enum(['on', 'off']).transform(v => v === 'on'),
  automation_cancellation_enabled:      z.enum(['on', 'off']).transform(v => v === 'on'),
  automation_payment_request_enabled:   z.enum(['on', 'off']).transform(v => v === 'on'),
  automation_dunning_enabled:           z.enum(['on', 'off']).transform(v => v === 'on'),
  automation_new_leads_enabled:         z.enum(['on', 'off']).transform(v => v === 'on'),
  payment_confirmation_default_enabled: z.enum(['on', 'off']).transform(v => v === 'on'),
  automation_lesson_reminder_hours:     z.coerce.number().refine(v => [2, 12, 24].includes(v), {
    message: 'AUTOMATION_HOURS_INVALID',
  }),
  automation_exam_good_luck_enabled:    z.enum(['on', 'off']).transform(v => v === 'on'),
  exam_good_luck_hour:                  z.coerce.number().refine(v => [6, 7, 8, 9].includes(v), {
    message: 'AUTOMATION_HOURS_INVALID',
  }),
  exam_good_luck_hours_before:          z.coerce.number().refine(v => [1, 2, 3].includes(v), {
    message: 'AUTOMATION_HOURS_INVALID',
  }),
  ai_assistant_enabled:                 z.enum(['on', 'off']).transform(v => v === 'on'),
})

export type AutomationSettingsResult = { error: string | null }

export async function saveAutomationSettings(
  _prev: AutomationSettingsResult,
  formData: FormData
): Promise<AutomationSettingsResult> {
  const session = await getSession()
  try {
    requireMutation(session)
  } catch (err) {
    return { error: await mutationBlockedError(err) }
  }
  const { orgId, role } = session
  const t = await getTranslations('settings.automations')

  if (role !== 'owner') {
    return { error: t('errors.ownerOnly') }
  }

  // This was the one WhatsApp write action with no plan gate at all, against
  // the project's own rule that every gated action calls requireFeature. An org
  // whose plan does not include WhatsApp could still save these toggles by
  // deep-linking the page (UX audit F4). Outside any try/catch — it redirects.
  await requireFeature(orgId, 'whatsapp_automation')

  const raw = {
    automation_lesson_reminder_enabled:   formData.get('automation_lesson_reminder_enabled') ?? 'off',
    automation_cancellation_enabled:      formData.get('automation_cancellation_enabled') ?? 'off',
    automation_payment_request_enabled:   formData.get('automation_payment_request_enabled') ?? 'off',
    automation_dunning_enabled:           formData.get('automation_dunning_enabled') ?? 'off',
    automation_new_leads_enabled:         formData.get('automation_new_leads_enabled') ?? 'off',
    payment_confirmation_default_enabled: formData.get('payment_confirmation_default_enabled') ?? 'off',
    automation_lesson_reminder_hours:     formData.get('automation_lesson_reminder_hours') ?? '24',
    automation_exam_good_luck_enabled:    formData.get('automation_exam_good_luck_enabled') ?? 'off',
    exam_good_luck_hour:                  formData.get('exam_good_luck_hour') ?? '7',
    exam_good_luck_hours_before:          formData.get('exam_good_luck_hours_before') ?? '2',
    ai_assistant_enabled:                 formData.get('ai_assistant_enabled') ?? 'off',
  }

  const parsed = Schema.safeParse(raw)
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message === 'AUTOMATION_HOURS_INVALID'
          ? t('errors.hoursInvalid')
          : await commonError('invalidData'),
    }
  }

  // The AI assistant is a separate entitlement that happens to be toggled from
  // this page. assertFeature rather than requireFeature: redirecting to billing
  // mid-save would silently discard the other nine toggles the owner just set.
  if (parsed.data.ai_assistant_enabled) {
    try {
      await assertFeature(orgId, 'ai_assistant')
    } catch (err) {
      if (err instanceof FeatureNotAvailableError) {
        return { error: t('errors.aiNotOnPlan') }
      }
      throw err
    }
  }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update(parsed.data)
    .eq('id', orgId)

  if (error) {
    console.error('[automations] DB update failed', { orgId, error: error.message })
    return { error: t('errors.saveFailed') }
  }

  revalidatePath('/settings/whatsapp')
  return { error: null }
}
