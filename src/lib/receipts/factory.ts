/**
 * Receipt provider factory — server-only.
 * Per /docs/sprint-15-scope.md § Story 1.
 *
 * Loads the org's receipt config from the DB, decrypts it using
 * PAYMENT_CONFIG_ENCRYPTION_KEY, and returns a GreenInvoiceProvider instance.
 *
 * Reuses PAYMENT_CONFIG_ENCRYPTION_KEY — no new env var required.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptWithKey } from '@/lib/crypto'
import { GreenInvoiceProvider, type GreenInvoiceConfig } from './green-invoice'
import { ReceiptProviderNotConfiguredError, type ReceiptProvider } from './index'

function getEncryptionKey(): string {
  const key = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
  if (!key) {
    throw new Error('[receipts/factory] PAYMENT_CONFIG_ENCRYPTION_KEY is not set')
  }
  if (key.length !== 64) {
    throw new Error('[receipts/factory] PAYMENT_CONFIG_ENCRYPTION_KEY must be a 64-character hex string')
  }
  return key
}

/**
 * Returns the configured receipt provider for the given org.
 * Decrypts credentials at call time — plaintext is never cached or logged.
 *
 * @throws ReceiptProviderNotConfiguredError if org has no receipt_config_encrypted
 * @throws Error on decryption or JSON parse failure
 */
export async function getReceiptProvider(orgId: string): Promise<ReceiptProvider> {
  const db = createServiceRoleClient()

  const { data: org, error } = await db
    .from('organizations')
    .select('receipt_config_encrypted')
    .eq('id', orgId)
    .single()

  if (error || !org) {
    throw new Error(`[receipts/factory] Failed to load org ${orgId}: ${error?.message ?? 'not found'}`)
  }

  if (!org.receipt_config_encrypted) {
    throw new ReceiptProviderNotConfiguredError(orgId)
  }

  const encryptionKey = getEncryptionKey()

  let configJson: string
  try {
    configJson = decryptWithKey(org.receipt_config_encrypted, encryptionKey)
  } catch (err) {
    throw new Error(`[receipts/factory] Failed to decrypt config for org ${orgId}: ${String(err)}`)
  }

  let config: GreenInvoiceConfig
  try {
    config = JSON.parse(configJson) as GreenInvoiceConfig
  } catch {
    throw new Error(`[receipts/factory] Decrypted config is not valid JSON for org ${orgId}`)
  }

  return new GreenInvoiceProvider(config)
}
