import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type OrgProviderStatus = {
  /** A payment provider is connected, so charges can carry a payment link. */
  hasPayment: boolean
  /** A receipt provider is connected, so paid charges can carry a receipt. */
  hasReceipt: boolean
}

/**
 * Whether the org has connected a payment / receipt provider.
 *
 * Reads only the presence of the encrypted config — never decrypts it — so it
 * is safe to call from any page that just needs to know whether a
 * provider-dependent column has any chance of holding a value.
 */
export async function getOrgProviderStatus(orgId: string): Promise<OrgProviderStatus> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('organizations')
    .select('payment_config_encrypted, receipt_config_encrypted')
    .eq('id', orgId)
    .maybeSingle()

  return {
    hasPayment: Boolean(data?.payment_config_encrypted),
    hasReceipt: Boolean(data?.receipt_config_encrypted),
  }
}
