/**
 * Reads back what Meta actually granted, before we trust it.
 *
 * The Embedded Signup popup hands the browser a WABA id and a phone number id,
 * and the browser hands them to us — so on their own they are client-supplied
 * values. GET /debug_token is the authoritative answer: it reports the scopes
 * the token carries and, in `granular_scopes`, the exact asset ids each scope
 * was granted over.
 *
 * Checking it at signup also converts the most common failure — the app's
 * WhatsApp permissions not yet approved by Meta — from a puzzling 403 on the
 * first send into one clear message at the moment of connecting.
 *
 * https://developers.facebook.com/docs/graph-api/reference/debug_token
 */

import { META_API_VERSION } from './graphVersion'

/** The two scopes a Cloud API connection cannot work without. */
export const REQUIRED_WHATSAPP_SCOPES = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
] as const

type GranularScope = { scope?: string; target_ids?: string[] }

type DebugTokenData = {
  app_id?: string
  is_valid?: boolean
  scopes?: string[]
  granular_scopes?: GranularScope[]
}

export type TokenGrant = {
  /** Entries of REQUIRED_WHATSAPP_SCOPES the token does not carry. */
  missingScopes: string[]
  /**
   * WABA ids `whatsapp_business_management` was granted over. Empty when Meta
   * returns the scope ungranularly, which is not an error — it just means there
   * is nothing to cross-check the browser-supplied WABA id against.
   */
  managedWabaIds: string[]
}

export class DebugTokenError extends Error {}

/**
 * Inspects an access token with the app's own credentials.
 * Throws DebugTokenError when Meta refuses the call or calls the token invalid.
 */
export async function inspectAccessToken(
  accessToken: string,
  appId: string,
  appSecret: string
): Promise<TokenGrant> {
  const params = new URLSearchParams({
    input_token:  accessToken,
    access_token: `${appId}|${appSecret}`,
  })

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/debug_token?${params.toString()}`
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new DebugTokenError(`debug_token failed ${res.status}: ${body}`)
  }

  const json = (await res.json()) as { data?: DebugTokenData }
  const data = json.data

  if (!data || data.is_valid === false) {
    throw new DebugTokenError('debug_token reports the access token as invalid')
  }

  // Meta lists WhatsApp scopes under granular_scopes, with the asset ids they
  // cover, and lists ungranular grants in the flat scopes array. A scope counts
  // as granted if it shows up in either.
  const granular = data.granular_scopes ?? []
  const granted = new Set<string>([
    ...(data.scopes ?? []),
    ...granular.map((g) => g.scope).filter((s): s is string => Boolean(s)),
  ])

  return {
    missingScopes: REQUIRED_WHATSAPP_SCOPES.filter((scope) => !granted.has(scope)),
    managedWabaIds:
      granular.find((g) => g.scope === 'whatsapp_business_management')?.target_ids ?? [],
  }
}
