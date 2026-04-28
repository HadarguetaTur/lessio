/**
 * AI provider factory — server-only. Sprint 25.
 *
 * Follows the same pattern as src/lib/payments/factory.ts:
 * fetch org config → decrypt API key → return adapter.
 *
 * OpenAI has a platform-level fallback via OPENAI_API_KEY env var.
 * Anthropic and Google require per-org keys.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptWithKey } from '@/lib/crypto'
import { OpenAiProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { GoogleProvider } from './google'
import { PROVIDER_MODELS } from './models'
import type { AiProvider, AiProviderName } from './types'

export class AiProviderNotConfiguredError extends Error {
  constructor(orgId: string, provider: string) {
    super(`[ai/factory] AI provider "${provider}" is not configured for org ${orgId} — no API key found`)
    this.name = 'AiProviderNotConfiguredError'
  }
}

function getAiEncryptionKey(): string {
  const key = process.env.AI_CONFIG_ENCRYPTION_KEY
  if (!key) {
    throw new Error('[ai/factory] AI_CONFIG_ENCRYPTION_KEY is not set')
  }
  if (key.length !== 64) {
    throw new Error('[ai/factory] AI_CONFIG_ENCRYPTION_KEY must be a 64-character hex string')
  }
  return key
}

function createAdapter(provider: AiProviderName, model: string, apiKey: string): AiProvider {
  switch (provider) {
    case 'openai':
      return new OpenAiProvider(apiKey, model)
    case 'anthropic':
      return new AnthropicProvider(apiKey, model)
    case 'google':
      return new GoogleProvider(apiKey, model)
  }
}

/**
 * Returns the configured AI provider for the given org.
 *
 * Resolution order for API key:
 * 1. Org-level encrypted key (ai_config_encrypted)
 * 2. Platform-level env var (OPENAI_API_KEY — only for OpenAI)
 *
 * @throws AiProviderNotConfiguredError if no API key is available
 */
export async function getAiProvider(
  orgId: string
): Promise<{ provider: AiProvider; providerName: AiProviderName; model: string }> {
  const db = createServiceRoleClient()

  const { data: org, error } = await db
    .from('organizations')
    .select('ai_provider, ai_model, ai_config_encrypted')
    .eq('id', orgId)
    .single()

  if (error || !org) {
    throw new Error(`[ai/factory] Failed to load org ${orgId}: ${error?.message ?? 'not found'}`)
  }

  const providerName = (org.ai_provider ?? 'openai') as AiProviderName
  const model = org.ai_model ?? PROVIDER_MODELS[providerName].defaultModel

  // Resolve API key: org-level encrypted key → platform env var (OpenAI only)
  let apiKey: string | undefined

  if (org.ai_config_encrypted) {
    const encryptionKey = getAiEncryptionKey()
    try {
      apiKey = decryptWithKey(org.ai_config_encrypted, encryptionKey)
    } catch (err) {
      throw new Error(`[ai/factory] Failed to decrypt AI config for org ${orgId}: ${String(err)}`)
    }
  } else if (providerName === 'openai' && process.env.OPENAI_API_KEY) {
    apiKey = process.env.OPENAI_API_KEY
  }

  if (!apiKey) {
    throw new AiProviderNotConfiguredError(orgId, providerName)
  }

  return {
    provider: createAdapter(providerName, model, apiKey),
    providerName,
    model,
  }
}

/**
 * Checks whether the AI assistant is configured for a specific org.
 * Async because it queries the DB.
 */
export async function isAiConfiguredForOrg(orgId: string): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('ai_provider, ai_config_encrypted')
    .eq('id', orgId)
    .single()

  if (!org) return false

  // Org has its own key
  if (org.ai_config_encrypted) return true

  // OpenAI can fall back to platform key
  if ((org.ai_provider ?? 'openai') === 'openai' && process.env.OPENAI_API_KEY) return true

  return false
}
