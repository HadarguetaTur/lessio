/**
 * AI provider model registry — Sprint 25.
 *
 * Maps each provider to its available models and default model.
 * Used by the factory (to validate model selection) and the settings UI
 * (to populate the model dropdown).
 */

import type { AiProviderName } from './types'

export interface ModelEntry {
  id: string
  label: string
}

export interface ProviderModels {
  provider: AiProviderName
  label: string
  models: ModelEntry[]
  defaultModel: string
}

export const PROVIDER_MODELS: Record<AiProviderName, ProviderModels> = {
  openai: {
    provider: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    provider: 'anthropic',
    label: 'Anthropic',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-6-20250514', label: 'Claude Sonnet 4.6' },
    ],
    defaultModel: 'claude-haiku-4-5-20251001',
  },
  google: {
    provider: 'google',
    label: 'Google',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    defaultModel: 'gemini-2.0-flash',
  },
}

/** All valid provider names */
export const AI_PROVIDER_NAMES: AiProviderName[] = ['openai', 'anthropic', 'google']

/** Check if a model ID is valid for a given provider */
export function isValidModel(provider: AiProviderName, model: string): boolean {
  return PROVIDER_MODELS[provider].models.some(m => m.id === model)
}
