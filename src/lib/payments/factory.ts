/**
 * Payment provider factory — server-only.
 * Per /docs/sprint-8-scope.md § Story 2.
 *
 * Fetches the org's payment provider config from the DB,
 * decrypts the credentials using PAYMENT_CONFIG_ENCRYPTION_KEY,
 * and returns the correct provider instance via the registry.
 *
 * To add a new provider: update registry.ts + registry-ui.ts only.
 * This file does not need to change when new providers are added.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptWithKey } from '@/lib/crypto'
import { getRegistryEntry } from './registry'
import { PaymentProviderNotConfiguredError, type PaymentProvider } from './index'

function getPaymentEncryptionKey(): string {
  const key = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
  if (!key) {
    throw new Error('[payments/factory] PAYMENT_CONFIG_ENCRYPTION_KEY is not set')
  }
  if (key.length !== 64) {
    throw new Error('[payments/factory] PAYMENT_CONFIG_ENCRYPTION_KEY must be a 64-character hex string')
  }
  return key
}

/**
 * Returns the configured payment provider for the given org.
 * Decrypts credentials at call time — plaintext is never cached or logged.
 *
 * @throws PaymentProviderNotConfiguredError if org has no payment_provider set
 * @throws Error if decryption fails, config JSON is malformed, or provider is unknown
 */
export async function getPaymentProvider(
  orgId: string
): Promise<{ provider: PaymentProvider; providerName: string }> {
  const db = createServiceRoleClient()

  const { data: org, error } = await db
    .from('organizations')
    .select('payment_provider, payment_config_encrypted')
    .eq('id', orgId)
    .single()

  if (error || !org) {
    throw new Error(`[payments/factory] Failed to load org ${orgId}: ${error?.message ?? 'not found'}`)
  }

  if (!org.payment_provider || !org.payment_config_encrypted) {
    throw new PaymentProviderNotConfiguredError(orgId)
  }

  const providerName = org.payment_provider as string
  const entry = getRegistryEntry(providerName)

  if (!entry) {
    throw new Error(`[payments/factory] Unknown provider "${providerName}" for org ${orgId}`)
  }

  const encryptionKey = getPaymentEncryptionKey()

  let configJson: string
  try {
    configJson = decryptWithKey(org.payment_config_encrypted, encryptionKey)
  } catch (err) {
    throw new Error(`[payments/factory] Failed to decrypt config for org ${orgId}: ${String(err)}`)
  }

  let config: Record<string, string>
  try {
    config = JSON.parse(configJson) as Record<string, string>
  } catch {
    throw new Error(`[payments/factory] Decrypted config is not valid JSON for org ${orgId}`)
  }

  return {
    provider: entry.createAdapter(config),
    providerName,
  }
}
