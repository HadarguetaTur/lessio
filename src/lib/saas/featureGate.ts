/**
 * SaaS feature gate helpers.
 * Per /docs/sprint-23-scope.md § Story 5b.
 *
 * requireFeature — call inside Server Actions or page-level guards.
 * Redirects to /account/billing?upgrade=<feature> when the org's plan
 * does not include the requested feature.
 *
 * Read-only rule: existing data created before a plan downgrade is always
 * readable. Gates only block writes (create / update / delete).
 */

import { redirect } from 'next/navigation'
import { getEffectiveSaasFeatures } from './subscriptions'
import type { SaasFeatures } from './types'

export { assertOrgNotSaasReadOnly, getEffectiveSaasFeatures } from './subscriptions'
export type { SaasFeatures } from './types'

/**
 * Asserts that the org has access to the given feature.
 * Redirects to the upgrade page if not.
 *
 * Call this BEFORE any DB mutation in the relevant Server Action / page.
 * Never call inside a try/catch — redirect() throws a special error.
 */
export async function requireFeature(
  orgId: string,
  feature: keyof SaasFeatures
): Promise<void> {
  const features = await getEffectiveSaasFeatures(orgId)
  if (!features[feature]) {
    redirect(`/account/billing?upgrade=${feature}`)
  }
}
