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

/** Thrown by {@link assertFeature}. Carries the feature so callers can name it. */
export class FeatureNotAvailableError extends Error {
  constructor(public readonly feature: keyof SaasFeatures) {
    super(`FEATURE_NOT_AVAILABLE:${feature}`)
    this.name = 'FeatureNotAvailableError'
  }
}

/**
 * The throwing twin of requireFeature, for callers that must not redirect.
 *
 * A redirect is the right answer for a person in a browser and the wrong one for
 * a machine: requireFeature would answer an API client with a 307 pointing at
 * the billing page, which a Make or n8n scenario reports as a confusing success.
 * Route handlers under /api/v1 use this and surface a 403 instead.
 *
 * Unlike requireFeature, this one IS safe inside a try/catch.
 */
export async function assertFeature(
  orgId: string,
  feature: keyof SaasFeatures
): Promise<void> {
  const features = await getEffectiveSaasFeatures(orgId)
  if (!features[feature]) {
    throw new FeatureNotAvailableError(feature)
  }
}
