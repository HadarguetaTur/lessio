'use server'

/**
 * Server actions for AI assistant settings.
 * Owner-only. Per /docs/sprint-19-scope.md § Story 3.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { isAiAssistantConfigured } from '@/lib/ai-assistant'
import { isAiConfiguredForOrg } from '@/lib/ai-assistant/providers/factory'
import { encryptWithKey } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireFeature } from '@/lib/saas/featureGate'
import { AI_PROVIDER_NAMES, isValidModel, PROVIDER_MODELS } from '@/lib/ai-assistant/providers/models'
import type { AiProviderName } from '@/lib/ai-assistant/providers/types'
import { commonError } from '@/lib/i18n/actionErrors'

export type AiAssistantActionState = {
  error: string | null
  success?: boolean
}

export type AiProviderActionState = {
  error: string | null
  success?: boolean
}

export type TestConnectionActionState = {
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
    return { error: await commonError('noPermission') }
  }

  try {
    requireMutation(session)
  } catch (error) {
    return {
      error: await commonError('supportModeReadOnly'),
    }
  }

  await requireFeature(session.orgId, 'ai_assistant')

  const parsed = ToggleSchema.safeParse({
    ai_assistant_enabled: formData.get('ai_assistant_enabled'),
  })

  if (!parsed.success) {
    return { error: await commonError('invalidData') }
  }

  const { ai_assistant_enabled } = parsed.data

  if (ai_assistant_enabled) {
    const configured = await isAiConfiguredForOrg(session.orgId)
    if (!configured && !isAiAssistantConfigured()) {
      return { error: 'לא ניתן להפעיל את עוזר ה-AI לפני שמוגדר מפתח API (בהגדרות הספק או בשרת).' }
    }
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

// ── Sprint 25: AI provider configuration ────────────────────────────────────

const ProviderSchema = z.object({
  ai_provider: z.enum(['openai', 'anthropic', 'google'] as const),
  ai_model: z.string().min(1),
  api_key: z.string().optional(),
})

function getAiEncryptionKey(): string {
  const key = process.env.AI_CONFIG_ENCRYPTION_KEY
  if (!key) throw new Error('[ai-settings] AI_CONFIG_ENCRYPTION_KEY is not set')
  if (key.length !== 64) throw new Error('[ai-settings] AI_CONFIG_ENCRYPTION_KEY must be a 64-character hex string')
  return key
}

export async function saveAiProviderAction(
  _prevState: AiProviderActionState,
  formData: FormData
): Promise<AiProviderActionState> {
  const session = await getSession()
  if (session.role !== 'owner') return { error: await commonError('noPermission') }

  try {
    requireMutation(session)
  } catch (error) {
    return { error: await commonError('supportModeReadOnly') }
  }

  await requireFeature(session.orgId, 'ai_assistant')

  const parsed = ProviderSchema.safeParse({
    ai_provider: formData.get('ai_provider'),
    ai_model: formData.get('ai_model'),
    api_key: formData.get('api_key') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? await commonError('invalidData') }
  }

  const { ai_provider, ai_model, api_key } = parsed.data

  if (!isValidModel(ai_provider, ai_model)) {
    return { error: `המודל "${ai_model}" אינו נתמך עבור ספק ${PROVIDER_MODELS[ai_provider].label}` }
  }

  const updateData: Record<string, unknown> = {
    ai_provider,
    ai_model,
  }

  // Encrypt and store API key if provided
  if (api_key && api_key.trim().length > 0) {
    const encryptionKey = getAiEncryptionKey()
    updateData.ai_config_encrypted = encryptWithKey(api_key.trim(), encryptionKey)
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update(updateData)
    .eq('id', session.orgId)

  if (updateError) {
    console.error('[ai-settings] Provider save failed', { orgId: session.orgId, error: updateError.message })
    return { error: 'שגיאה בשמירת הגדרות הספק' }
  }

  console.info('[ai-settings] Provider saved', { orgId: session.orgId, ai_provider, ai_model })
  revalidatePath('/settings/ai-assistant')
  return { error: null, success: true }
}

export async function testAiConnectionAction(
  _prevState: TestConnectionActionState,
  formData: FormData
): Promise<TestConnectionActionState> {
  const session = await getSession()
  if (session.role !== 'owner') return { error: await commonError('noPermission') }

  await requireFeature(session.orgId, 'ai_assistant')

  try {
    const { getAiProvider } = await import('@/lib/ai-assistant/providers/factory')
    const { provider } = await getAiProvider(session.orgId)

    const result = await provider.chat({
      systemPrompt: 'You are a test assistant. Reply with "OK" in one word.',
      history: [],
      userMessage: 'Hello',
      maxTokens: 10,
      temperature: 0,
    })

    if (!result.content) {
      return { error: 'התקבלה תגובה ריקה מהספק' }
    }

    console.info('[ai-settings] Connection test passed', { orgId: session.orgId })
    return { error: null, success: true }
  } catch (err) {
    console.error('[ai-settings] Connection test failed', { orgId: session.orgId, err })
    const message = err instanceof Error ? err.message : 'שגיאה לא ידועה'
    return { error: `בדיקת חיבור נכשלה: ${message}` }
  }
}
