'use server'

/**
 * Server actions for payment provider settings.
 * Owner-only. Per /docs/sprint-8-scope.md § Story 3.
 *
 * savePaymentProvider — validates provider credentials via the registry,
 *   encrypts the config, and stores it on the org.
 *
 * disconnectPayment — nulls both payment fields so the org has no active provider.
 *
 * To add a new provider: update registry.ts + registry-ui.ts only.
 * This file does not change when new providers are added.
 */

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { encryptWithKey } from '@/lib/crypto'
import { getRegistryEntry } from '@/lib/payments/registry'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

// ── Result types ──────────────────────────────────────────────────────────────

export type PaymentActionResult = {
  error: string | null
}

// ── savePaymentProvider ───────────────────────────────────────────────────────

export async function savePaymentProvider(
  _prevState: PaymentActionResult,
  formData: FormData
): Promise<PaymentActionResult> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  const provider = formData.get('provider')
  if (!provider || typeof provider !== 'string') {
    return { error: t('settings.paymentActions.errors.providerNotSelected') }
  }

  const entry = getRegistryEntry(provider)
  if (!entry) {
    return { error: t('settings.paymentActions.errors.providerUnsupported', { provider }) }
  }

  // Extract all fields defined for this provider from formData
  const providerUI = getProviderUI(provider)
  const fieldData: Record<string, string | undefined> = {}
  for (const field of providerUI?.fields ?? []) {
    const val = formData.get(field.name)
    fieldData[field.name] = val ? String(val).trim() : undefined
  }

  // Validate using the registry entry's validator (Zod under the hood)
  const validation = entry.validateConfig(fieldData)
  if (!validation.success) {
    return { error: await zodError(validation.errorKey ? { message: validation.errorKey } : undefined) }
  }

  const encryptionKey = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
  if (!encryptionKey) {
    console.error('[payment/settings] PAYMENT_CONFIG_ENCRYPTION_KEY not set', { orgId })
    return { error: t('settings.paymentActions.errors.missingEncryptionKey') }
  }

  let encryptedConfig: string
  try {
    encryptedConfig = encryptWithKey(JSON.stringify(validation.config), encryptionKey)
  } catch (err) {
    console.error('[payment/settings] Config encryption failed', { orgId, err })
    return { error: t('settings.paymentActions.errors.encryptFailed') }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({
      payment_provider: provider,
      payment_config_encrypted: encryptedConfig,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[payment/settings] DB update failed', { orgId, error: updateError.message })
    return { error: t('settings.paymentActions.errors.saveFailed') }
  }

  console.info('[payment/settings] Payment provider saved', { orgId, provider })
  revalidatePath('/settings/payment')
  return { error: null }
}

// ── saveAutoSendSetting ───────────────────────────────────────────────────────

export async function saveAutoSendSetting(
  _prevState: PaymentActionResult,
  formData: FormData
): Promise<PaymentActionResult> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  const autoSend = formData.get('auto_send_payment_request') === 'on'

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({ auto_send_payment_request: autoSend })
    .eq('id', orgId)

  if (updateError) {
    console.error('[payment/settings] saveAutoSendSetting DB update failed', { orgId, error: updateError.message })
    return { error: t('settings.paymentActions.errors.saveSettingFailed') }
  }

  console.info('[payment/settings] auto_send_payment_request updated', { orgId, autoSend })
  revalidatePath('/settings/payment')
  return { error: null }
}

// ── disconnectPayment ─────────────────────────────────────────────────────────

export async function disconnectPayment(
  _prevState: PaymentActionResult,
  _formData: FormData
): Promise<PaymentActionResult> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({
      payment_provider: null,
      payment_config_encrypted: null,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[payment/settings] Disconnect DB update failed', { orgId, error: updateError.message })
    return { error: t('settings.paymentActions.errors.disconnectFailed') }
  }

  console.info('[payment/settings] Payment provider disconnected', { orgId })
  revalidatePath('/settings/payment')
  return { error: null }
}
