/**
 * Where conversion events go.
 * Server-only; service-role client.
 *
 * Per /docs/sprint-34-scope.md § C.
 *
 * Ids live in the database rather than in `NEXT_PUBLIC_*` env vars: Next 16
 * inlines those at build time, so swapping a pixel would mean a redeploy, and
 * the value silently differs between environments. Reading them per request
 * costs one indexed query and makes the change a form submission instead.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptWithKey, encryptWithKey } from '@/lib/crypto'

export const TRACKING_PROVIDERS = [
  'meta_pixel',
  'ga4',
  'gtm',
  'google_ads',
  'tiktok',
  'linkedin',
] as const

export type TrackingProvider = (typeof TRACKING_PROVIDERS)[number]

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing'

export type TrackingDestination = {
  id: string
  provider: TrackingProvider
  label: string
  externalId: string
  testEventCode: string | null
  consentCategory: ConsentCategory
  isEnabled: boolean
  /** True when a server-side credential is stored. The value itself never
   *  leaves the server — a screen only needs to know whether one is set. */
  hasServerCredential: boolean
}

/** Providers that can also receive events server-side, not only from the page. */
export const SERVER_SIDE_PROVIDERS: TrackingProvider[] = ['meta_pixel', 'ga4']

function encryptionKey(): string | null {
  return process.env.TRACKING_CONFIG_ENCRYPTION_KEY ?? null
}

type RawDestination = {
  id: string
  provider: string
  label: string
  external_id: string
  config_encrypted: string | null
  test_event_code: string | null
  consent_category: string
  is_enabled: boolean
}

function map(row: RawDestination): TrackingDestination {
  return {
    id: row.id,
    provider: row.provider as TrackingProvider,
    label: row.label,
    externalId: row.external_id,
    testEventCode: row.test_event_code,
    consentCategory: row.consent_category as ConsentCategory,
    isEnabled: row.is_enabled,
    hasServerCredential: Boolean(row.config_encrypted),
  }
}

export async function listDestinations(): Promise<TrackingDestination[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('tracking_destinations')
    .select(
      'id, provider, label, external_id, config_encrypted, test_event_code, consent_category, is_enabled'
    )
    .order('provider', { ascending: true })

  if (error || !data) return []
  return (data as RawDestination[]).map(map)
}

/**
 * The destinations a page should actually load.
 *
 * Never throws and never rejects: this runs inside the root layout, so a
 * tracking misconfiguration must degrade to "no pixels" rather than to a blank
 * site.
 */
export async function listEnabledDestinations(): Promise<TrackingDestination[]> {
  try {
    return (await listDestinations()).filter((d) => d.isEnabled)
  } catch (err) {
    console.error('[tracking] failed to read destinations', err)
    return []
  }
}

/** The decrypted server-side credential, or null. Server-only. */
export async function getServerCredential(destinationId: string): Promise<string | null> {
  const key = encryptionKey()
  if (!key) return null

  const db = createServiceRoleClient()
  const { data } = await db
    .from('tracking_destinations')
    .select('config_encrypted')
    .eq('id', destinationId)
    .maybeSingle()

  const encrypted = (data as { config_encrypted: string | null } | null)?.config_encrypted
  if (!encrypted) return null

  try {
    return decryptWithKey(encrypted, key)
  } catch (err) {
    // A key rotation leaves undecryptable rows behind. Failing loudly here
    // would take down every page that renders a pixel.
    console.error('[tracking] credential decrypt failed', destinationId, err)
    return null
  }
}

export type SaveDestinationInput = {
  id?: string
  provider: TrackingProvider
  label: string
  externalId: string
  /** Omit to leave an existing credential untouched; empty string clears it. */
  serverCredential?: string
  testEventCode: string | null
  consentCategory: ConsentCategory
  isEnabled: boolean
}

export type DestinationResult = { ok: true; id: string } | { ok: false; error: string }

export async function saveDestination(
  input: SaveDestinationInput
): Promise<DestinationResult> {
  const db = createServiceRoleClient()

  const row: Record<string, unknown> = {
    provider: input.provider,
    label: input.label,
    external_id: input.externalId,
    test_event_code: input.testEventCode,
    consent_category: input.consentCategory,
    is_enabled: input.isEnabled,
    updated_at: new Date().toISOString(),
  }

  if (input.serverCredential !== undefined) {
    if (input.serverCredential === '') {
      row.config_encrypted = null
    } else {
      const key = encryptionKey()
      if (!key) return { ok: false, error: 'MISSING_ENCRYPTION_KEY' }
      row.config_encrypted = encryptWithKey(input.serverCredential, key)
    }
  }

  const query = input.id
    ? db.from('tracking_destinations').update(row).eq('id', input.id).select('id').single()
    : db.from('tracking_destinations').insert(row).select('id').single()

  const { data, error } = await query
  if (error) {
    // The partial unique index rejects a second enabled destination for one
    // provider — two live Meta pixels would double-count every conversion.
    if (error.code === '23505') return { ok: false, error: 'PROVIDER_ALREADY_ENABLED' }
    return { ok: false, error: error.message }
  }

  return { ok: true, id: (data as { id: string }).id }
}

export async function deleteDestination(id: string): Promise<DestinationResult> {
  const db = createServiceRoleClient()
  const { error } = await db.from('tracking_destinations').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, id }
}
