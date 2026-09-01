/**
 * Server-side conversion events.
 * Server-only.
 *
 * Per /docs/sprint-34-scope.md § C, step 4.
 *
 * The point of sending from the server is `Purchase`: a revenue signal fired in
 * the browser is trivially spoofable and is lost to every ad blocker, so an ad
 * platform optimising on it optimises on clicks that reached a thank-you page.
 * Sent from the Sumit webhook instead, it means a subscription that was
 * actually paid for — which is also what makes CAC computable.
 *
 * Every send carries an `event_id` shared with the browser pixel so Meta
 * deduplicates the pair. Without it a conversion fired on both sides counts
 * twice, and every ratio built on it is wrong.
 */

import { createHash, randomUUID } from 'node:crypto'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getServerCredential,
  listEnabledDestinations,
  type TrackingDestination,
} from './destinations'

/** The four moments worth measuring, in the order a customer meets them. */
export type ConversionEvent =
  | 'Lead'
  | 'CompleteRegistration'
  | 'StartTrial'
  | 'Purchase'

export type TrackEventInput = {
  event: ConversionEvent
  /** Share this with the browser pixel. Generated when absent. */
  eventId?: string
  /** Anonymous visitor id from the `ls_vid` cookie, for attribution joins. */
  visitorId?: string | null
  organizationId?: string | null
  email?: string | null
  phone?: string | null
  value?: number
  currency?: string
  /** The page the conversion happened on, as the platforms expect. */
  sourceUrl?: string | null
  clientIp?: string | null
  userAgent?: string | null
  fbclid?: string | null
}

/** Meta requires PII hashed with SHA-256 over a normalised, lowercased value. */
function hashed(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

const META_API_VERSION = 'v21.0'
const SEND_TIMEOUT_MS = 8000

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `${res.status} ${text.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

async function sendToMeta(
  destination: TrackingDestination,
  input: TrackEventInput,
  eventId: string
): Promise<{ ok: boolean; error?: string }> {
  const token = await getServerCredential(destination.id)
  if (!token) return { ok: false, error: 'NO_ACCESS_TOKEN' }

  const userData: Record<string, unknown> = {
    em: hashed(input.email),
    ph: hashed(input.phone),
    client_ip_address: input.clientIp ?? undefined,
    client_user_agent: input.userAgent ?? undefined,
    fbc: input.fbclid ? `fb.1.${Date.now()}.${input.fbclid}` : undefined,
  }

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: input.event,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: input.sourceUrl ?? undefined,
        user_data: userData,
        custom_data:
          input.value != null
            ? { value: input.value, currency: input.currency ?? 'ILS' }
            : undefined,
      },
    ],
  }

  if (destination.testEventCode) body.test_event_code = destination.testEventCode

  return postJson(
    `https://graph.facebook.com/${META_API_VERSION}/${destination.externalId}/events?access_token=${encodeURIComponent(token)}`,
    body
  )
}

async function sendToGa4(
  destination: TrackingDestination,
  input: TrackEventInput,
  eventId: string
): Promise<{ ok: boolean; error?: string }> {
  const apiSecret = await getServerCredential(destination.id)
  if (!apiSecret) return { ok: false, error: 'NO_API_SECRET' }

  // GA4 keys everything on client_id. The visitor cookie is the only stable
  // anonymous id we hold server-side; without it GA4 rejects the payload.
  const clientId = input.visitorId ?? eventId

  return postJson(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(destination.externalId)}&api_secret=${encodeURIComponent(apiSecret)}`,
    {
      client_id: clientId,
      events: [
        {
          // GA4's recommended names are snake_case, unlike Meta's.
          name: input.event === 'Purchase' ? 'purchase' : toSnake(input.event),
          params: {
            engagement_time_msec: 1,
            transaction_id: eventId,
            value: input.value,
            currency: input.value != null ? (input.currency ?? 'ILS') : undefined,
          },
        },
      ],
    }
  )
}

function toSnake(event: ConversionEvent): string {
  return event.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * Fires one conversion to every enabled destination that can receive it
 * server-side, recording the outcome.
 *
 * Never throws. A tracking failure must not roll back the signup or the
 * payment that triggered it — the row in `tracking_events` is what turns a
 * silent loss into something the operator can see and retry.
 */
export async function trackEvent(input: TrackEventInput): Promise<{ eventId: string }> {
  const eventId = input.eventId ?? randomUUID()

  try {
    const destinations = await listEnabledDestinations()
    const db = createServiceRoleClient()

    await Promise.all(
      destinations
        .filter((d) => d.provider === 'meta_pixel' || d.provider === 'ga4')
        .map(async (destination) => {
          const result =
            destination.provider === 'meta_pixel'
              ? await sendToMeta(destination, input, eventId)
              : await sendToGa4(destination, input, eventId)

          await db
            .from('tracking_events')
            .upsert(
              {
                event_name: input.event,
                event_id: eventId,
                destination_id: destination.id,
                organization_id: input.organizationId ?? null,
                visitor_id: input.visitorId ?? null,
                value: input.value ?? null,
                currency: input.currency ?? null,
                payload: { sourceUrl: input.sourceUrl ?? null },
                status: result.ok ? 'sent' : 'failed',
                attempts: 1,
                error: result.ok ? null : (result.error ?? 'unknown'),
                sent_at: result.ok ? new Date().toISOString() : null,
              },
              { onConflict: 'event_id,destination_id' }
            )
            .then(({ error }) => {
              if (error) console.error('[tracking] log write failed', error.message)
            })
        })
    )
  } catch (err) {
    console.error('[tracking] trackEvent failed', input.event, err)
  }

  return { eventId }
}
