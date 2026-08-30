/**
 * GET /api/v1/me — who this API key belongs to.
 *
 * The first call anyone makes. Someone wiring up a Make scenario pastes a key,
 * runs this, and needs to see their own organisation's name to know the key is
 * live — so it is deliberately the cheapest endpoint and needs only `read`.
 * Every failure mode of the wrapper (bad key, missing scope, plan without
 * integrations, throttled) surfaces here first, where it costs nothing.
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { withApiAuth } from '@/lib/api/handler'
import { apiSuccess, ApiError } from '@/lib/api/respond'
import { getOrgSubscriptionState } from '@/lib/saas/subscriptions'

export const GET = withApiAuth('read', async ({ session }): Promise<NextResponse> => {
  const db = createServiceRoleClient()

  const { data: org, error } = await db
    .from('organizations')
    .select('id, name, timezone, currency, default_locale')
    .eq('id', session.orgId)
    .maybeSingle()

  if (error) {
    console.error('[api/v1/me] org lookup failed', {
      orgId: session.orgId,
      error: error.message,
    })
    throw new ApiError('internal_error', 'Could not load the organization.')
  }

  if (!org) {
    throw new ApiError('not_found', 'Organization not found.')
  }

  const subscription = await getOrgSubscriptionState(session.orgId)

  return apiSuccess({
    organization: {
      id: org.id,
      name: org.name,
      timezone: org.timezone,
      currency: org.currency,
      locale: org.default_locale,
    },
    apiKey: {
      id: session.keyId,
      scopes: session.scopes,
    },
    // null means a grandfathered org with no subscription row — it has every
    // feature, so an automation should read null as "allowed", not "unknown".
    plan: subscription
      ? { name: subscription.planName, status: subscription.status }
      : null,
  })
})
