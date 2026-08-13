/**
 * WABA-level webhook subscription.
 *
 * The app-level webhook callback (configured in the Meta App Dashboard) is not
 * enough on its own: each customer WABA connected via Embedded Signup must also
 * be subscribed to the app with POST /{WABA_ID}/subscribed_apps, otherwise Meta
 * never dispatches message events for that WABA to our webhook.
 *
 * Called with the customer's own access token (obtained during Embedded Signup).
 * The POST is idempotent on Meta's side — re-subscribing an already-subscribed
 * WABA succeeds.
 */

const META_API_VERSION = 'v19.0'

/**
 * Subscribes our app to the given WABA so Meta starts delivering its webhook
 * events (messages, statuses) to the app's configured callback URL.
 * Throws on any non-OK response.
 */
export async function subscribeAppToWABA(
  wabaId: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/subscribed_apps`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[subscribeApp] Failed to subscribe WABA ${wabaId}: ${res.status} ${body}`)
  }

  console.info(`[subscribeApp] WABA ${wabaId} subscribed to app`)
}

export type SubscribedApp = {
  whatsapp_business_api_data?: { id?: string; name?: string; link?: string }
}

/**
 * Lists the apps currently subscribed to the given WABA.
 * Used by the backfill script to verify a subscription took effect.
 */
export async function getSubscribedApps(
  wabaId: string,
  accessToken: string
): Promise<SubscribedApp[]> {
  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/subscribed_apps`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[subscribeApp] Failed to list subscribed apps for WABA ${wabaId}: ${res.status} ${body}`)
  }

  const json = await res.json() as { data?: SubscribedApp[] }
  return json.data ?? []
}
