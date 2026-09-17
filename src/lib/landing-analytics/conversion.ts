/**
 * Marks the landing visit that turned into a signup or an enquiry, so
 * /admin/attribution can count conversions per post without a join.
 *
 * Never throws: this is bookkeeping on the side of a signup, and a failure
 * here must not be able to fail — or even slow — the thing it describes.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function stampLandingConversion(input: {
  visitorId: string | null
  organizationId?: string | null
  leadId?: string | null
}): Promise<void> {
  if (!input.visitorId) return
  if (!input.organizationId && !input.leadId) return

  try {
    const { error } = await createServiceRoleClient().rpc('stamp_landing_conversion', {
      p_visitor_id: input.visitorId,
      p_org_id: input.organizationId ?? null,
      p_lead_id: input.leadId ?? null,
    })
    if (error) console.error('[landing-analytics] conversion stamp failed', error.message)
  } catch (err) {
    console.error('[landing-analytics] conversion stamp threw', err)
  }
}
