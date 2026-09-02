import { redirect } from 'next/navigation'
import {
  getPortalSettings,
  isPortalFeatureOn,
  type PortalFeature,
} from '@/lib/organizations/portalSettings'

/**
 * Per-page gate for a portal section the org has switched off.
 *
 * Sends the parent to the portal home rather than rendering a 404: the link
 * they followed was probably ours (a WhatsApp reply, a bookmark from before
 * the toggle flipped) and home is the one screen every open portal has.
 *
 * Never call inside a try/catch — `redirect()` throws to work.
 */
export async function requirePortalFeature(orgId: string, feature: PortalFeature): Promise<void> {
  const settings = await getPortalSettings(orgId)
  if (!isPortalFeatureOn(settings, feature)) {
    redirect(`/portal/${orgId}/home`)
  }
}

/**
 * Non-redirecting twin for server actions, which answer with a typed result
 * rather than a navigation. A parent whose page was already open when the
 * toggle flipped can still submit the form; this is what stops the write.
 */
export async function isPortalFeatureEnabled(orgId: string, feature: PortalFeature): Promise<boolean> {
  const settings = await getPortalSettings(orgId)
  return isPortalFeatureOn(settings, feature)
}
