/**
 * organization_api_keys persistence — server-only.
 *
 * Kept apart from auth.ts so the settings screen (which manages keys) and the
 * request path (which verifies them) do not import each other.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { mintApiKey, type ApiScope } from './keys'

export interface ApiKeySummary {
  id: string
  name: string
  /** Leading characters of the key. The full value is unrecoverable. */
  prefix: string
  scopes: ApiScope[]
  createdAt: string
  lastUsedAt: string | null
}

export interface CreatedApiKey extends ApiKeySummary {
  /** The one and only time this is ever available. */
  plaintext: string
}

/** Live keys for an org, newest first. Revoked keys are dropped from the list. */
export async function listApiKeys(orgId: string): Promise<ApiKeySummary[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organization_api_keys')
    .select('id, name, key_prefix, scopes, created_at, last_used_at')
    .eq('organization_id', orgId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[api/store] list failed', { orgId, error: error.message })
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    prefix: row.key_prefix as string,
    scopes: (row.scopes ?? []) as ApiScope[],
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  }))
}

/**
 * Mints and stores a key, returning the plaintext to hand to the caller once.
 * Nothing here writes the plaintext anywhere — not the row, not the log.
 */
export async function createApiKey(params: {
  orgId: string
  name: string
  scopes: ApiScope[]
  createdBy: string
}): Promise<CreatedApiKey> {
  const db = createServiceRoleClient()
  const minted = mintApiKey()

  const { data, error } = await db
    .from('organization_api_keys')
    .insert({
      organization_id: params.orgId,
      name: params.name,
      key_hash: minted.hash,
      key_prefix: minted.prefix,
      scopes: params.scopes,
      created_by: params.createdBy,
    })
    .select('id, name, key_prefix, scopes, created_at, last_used_at')
    .single()

  if (error) {
    console.error('[api/store] create failed', { orgId: params.orgId, error: error.message })
    throw new Error(error.message)
  }

  console.info('[api/store] API key created', {
    orgId: params.orgId,
    keyId: data.id,
    prefix: minted.prefix,
    scopes: params.scopes,
  })

  return {
    id: data.id as string,
    name: data.name as string,
    prefix: data.key_prefix as string,
    scopes: (data.scopes ?? []) as ApiScope[],
    createdAt: data.created_at as string,
    lastUsedAt: null,
    plaintext: minted.plaintext,
  }
}

/**
 * Revokes a key. The row stays: api_request_log references it, and an owner
 * investigating what an automation did needs the name to survive the revoke.
 * Returns false when the id does not belong to this org.
 */
export async function revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organization_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('organization_id', orgId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[api/store] revoke failed', { orgId, keyId, error: error.message })
    throw new Error(error.message)
  }

  if (data) {
    console.info('[api/store] API key revoked', { orgId, keyId })
  }

  return Boolean(data)
}

/** Recent API calls for the activity list on the settings screen. */
export async function listRecentApiRequests(
  orgId: string,
  limit = 20
): Promise<
  { id: number; method: string; path: string; statusCode: number; createdAt: string }[]
> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('api_request_log')
    .select('id, method, path, status_code, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    // The activity list is a diagnostic aid, not the point of the page — a
    // failure here must not take the whole settings screen down with it.
    console.error('[api/store] request log read failed', { orgId, error: error.message })
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id as number,
    method: row.method as string,
    path: row.path as string,
    statusCode: row.status_code as number,
    createdAt: row.created_at as string,
  }))
}
