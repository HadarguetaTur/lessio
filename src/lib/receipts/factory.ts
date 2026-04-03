/**
 * Receipt provider factory — server-only.
 *
 * Loads the org's receipt_provider (plaintext) and receipt_config_encrypted
 * from the DB, decrypts the credentials, and returns the matching adapter.
 *
 * Backward compatibility:
 *   Orgs with receipt_config_encrypted set but receipt_provider = NULL
 *   are treated as 'green-invoice' (pre-migration rows).
 *
 * Reuses PAYMENT_CONFIG_ENCRYPTION_KEY — no new env var required.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptWithKey } from '@/lib/crypto'
import { GreenInvoiceProvider, type GreenInvoiceConfig } from './green-invoice'
import { ICountProvider, type ICountConfig } from './icount'
import { SumitProvider, type SumitConfig } from './sumit'
import { ReceiptProviderNotConfiguredError, type ReceiptProvider } from './index'

export type ReceiptProviderType = 'green-invoice' | 'icount' | 'sumit'

export const RECEIPT_PROVIDER_LABELS: Record<ReceiptProviderType, string> = {
  'green-invoice': 'חשבוניות ירוקות (Morning)',
  'icount':        'iCount',
  'sumit':         'Sumit (סאמיט)',
}

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
 * @throws Error on unknown provider, decryption, or JSON parse failure
 */
export async function getReceiptProvider(orgId: string): Promise<ReceiptProvider> {
  const db = createServiceRoleClient()

  const { data: org, error } = await db
    .from('organizations')
    .select('receipt_provider, receipt_config_encrypted')
    .eq('id', orgId)
    .single()

  if (error || !org) {
    throw new Error(`[receipts/factory] Failed to load org ${orgId}: ${error?.message ?? 'not found'}`)
  }

  if (!org.receipt_config_encrypted) {
    throw new ReceiptProviderNotConfiguredError(orgId)
  }

  const providerType: ReceiptProviderType =
    (org.receipt_provider as ReceiptProviderType | null) ?? 'green-invoice'

  const encryptionKey = getEncryptionKey()

  let configJson: string
  try {
    configJson = decryptWithKey(org.receipt_config_encrypted, encryptionKey)
  } catch (err) {
    throw new Error(`[receipts/factory] Failed to decrypt config for org ${orgId}: ${String(err)}`)
  }

  let config: Record<string, string>
  try {
    config = JSON.parse(configJson) as Record<string, string>
  } catch {
    throw new Error(`[receipts/factory] Decrypted config is not valid JSON for org ${orgId}`)
  }

  switch (providerType) {
    case 'green-invoice':
      return new GreenInvoiceProvider(config as unknown as GreenInvoiceConfig)

    case 'icount':
      return new ICountProvider(config as unknown as ICountConfig)

    case 'sumit':
      return new SumitProvider(config as unknown as SumitConfig)

    default: {
      const _exhaustive: never = providerType
      throw new Error(`[receipts/factory] Unknown receipt provider type: ${String(_exhaustive)}`)
    }
  }
}
