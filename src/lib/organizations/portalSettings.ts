import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Parent-portal toggles, per organization (`organizations.portal_settings`).
 *
 * One jsonb column rather than a boolean per feature (decision #31 shape), so a
 * new portal section is a new key here and nothing else. A missing key means
 * "on" — that is what keeps every existing org's portal exactly as it was
 * before the column existed. Only an explicit `false` switches anything off.
 *
 * Home and schedule are not in the list on purpose: with them gone the portal
 * has nothing left to show, and "no portal" is what the master switch is for.
 */
export const PORTAL_FEATURES = [
  'payments',
  'homework',
  'exams',
  'progress',
  'messages',
  'booking',
  'cancellation',
] as const

export type PortalFeature = (typeof PORTAL_FEATURES)[number]

export type PortalSettings = { enabled: boolean } & Record<PortalFeature, boolean>

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  enabled: true,
  payments: true,
  homework: true,
  exams: true,
  progress: true,
  messages: true,
  booking: true,
  cancellation: true,
}

export function normalizePortalSettings(value: unknown): PortalSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_PORTAL_SETTINGS }
  }
  const raw = value as Record<string, unknown>
  const settings = { ...DEFAULT_PORTAL_SETTINGS }
  if (raw.enabled === false) settings.enabled = false
  for (const feature of PORTAL_FEATURES) {
    if (raw[feature] === false) settings[feature] = false
  }
  return settings
}

/**
 * Loads the org's portal toggles. Wrapped in React `cache` so the portal
 * layout, the page and the tab bar share one query per request instead of
 * three; outside a server render `cache` is a plain pass-through.
 *
 * A read failure returns the defaults (everything on) rather than throwing:
 * this gate guards visibility, not money, and a DB blip must not take the
 * whole portal down with it.
 */
export const getPortalSettings = cache(async (orgId: string): Promise<PortalSettings> => {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organizations')
    .select('portal_settings')
    .eq('id', orgId)
    .maybeSingle()

  if (error) {
    console.error('[portalSettings] Failed to load portal settings — using defaults', {
      orgId,
      error: error.message,
    })
    return { ...DEFAULT_PORTAL_SETTINGS }
  }

  return normalizePortalSettings((data as Record<string, unknown> | null)?.portal_settings)
})

/** True when the portal is open and this feature is switched on. */
export function isPortalFeatureOn(settings: PortalSettings, feature: PortalFeature): boolean {
  return settings.enabled && settings[feature]
}
