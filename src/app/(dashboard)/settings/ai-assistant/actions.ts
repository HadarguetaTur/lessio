'use server'

/**
 * Server actions for AI assistant settings.
 * Owner-only. Per /docs/sprint-19-scope.md § Story 3.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { isAiAssistantConfigured } from '@/lib/ai-assistant'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type AiAssistantActionState = {
  error: string | null
  success?: boolean
}

const ToggleSchema = z.object({
  ai_assistant_enabled: z.union([z.literal('on'), z.null()]).transform((value) => value === 'on'),
})

export async function saveAiAssistantSettings(
  _prevState: AiAssistantActionState,
  formData: FormData
): Promise<AiAssistantActionState> {
  const session = await getSession()

  if (session.role !== 'owner') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  try {
    requireMutation(session)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'מצב תמיכה הוא קריאה בלבד.',
    }
  }

  const parsed = ToggleSchema.safeParse({
    ai_assistant_enabled: formData.get('ai_assistant_enabled'),
  })

  if (!parsed.success) {
    return { error: 'נתונים לא תקינים' }
  }

  const { ai_assistant_enabled } = parsed.data

  if (ai_assistant_enabled && !isAiAssistantConfigured()) {
    return { error: 'לא ניתן להפעיל את עוזר ה-AI לפני שמוגדר OPENAI_API_KEY בשרת.' }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({ ai_assistant_enabled })
    .eq('id', session.orgId)

  if (updateError) {
    console.error('[ai-assistant/settings] DB update failed', { orgId: session.orgId, error: updateError.message })
    return { error: 'שגיאה בשמירת ההגדרות' }
  }

  console.info('[ai-assistant/settings] Settings saved', { orgId: session.orgId, ai_assistant_enabled })
  revalidatePath('/settings/ai-assistant')
  return { error: null, success: true }
}
