import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * The org's IANA timezone, used to render every lesson time.
 *
 * Service role, not the cookie-bound anon client: this is called from the parent
 * portal too, where there is no Supabase Auth session, so RLS returned no row and
 * every org silently fell back to Asia/Jerusalem. The org id is always resolved
 * server-side (session or verified portal JWT), never taken from the client.
 */
async function getOrgTimezoneUncached(organizationId: string): Promise<string> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', organizationId)
    .single()

  return data?.timezone ?? 'Asia/Jerusalem'
}

/** Per-request memo of {@link getOrgTimezoneUncached}: one read per render, however many callers. */
export const getOrgTimezone = cache(getOrgTimezoneUncached)
