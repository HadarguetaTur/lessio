'use server'

/**
 * Server actions for WhatsApp Embedded Signup settings.
 * Owner-only. Per /docs/sprint-7-scope.md § Story 3.
 *
 * saveWhatsAppConnection — exchanges the one-time code from Meta's Embedded
 *   Signup flow for an access token, encrypts it, and stores both the
 *   phone_number_id and the encrypted token on the organization row.
 *
 * disconnectWhatsApp — clears both fields so the org is back to unconnected.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { encryptToken } from '@/lib/crypto'
import { registerTemplatesForWABA } from '@/lib/whatsapp/registerTemplates'
import { subscribeAppToWABA } from '@/lib/whatsapp/subscribeApp'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const SaveSchema = z.object({
  phoneNumberId: z.string().min(1, 'phone_number_id is required'),
  wabaId:        z.string().optional(),
  code:          z.string().min(1, 'OAuth code is required'),
})

// ── Result types ──────────────────────────────────────────────────────────────

export type WhatsAppActionResult = {
  error: string | null
}

// ── saveWhatsAppConnection ────────────────────────────────────────────────────

/**
 * Exchanges the Embedded Signup OAuth code for a long-lived access token,
 * encrypts it, and persists phone_number_id + encrypted token on the org.
 */
export async function saveWhatsAppConnection(
  _prevState: WhatsAppActionResult,
  formData: FormData
): Promise<WhatsAppActionResult> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const parsed = SaveSchema.safeParse({
    phoneNumberId: formData.get('phoneNumberId'),
    wabaId:        formData.get('wabaId') ?? undefined,
    code:          formData.get('code'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const { phoneNumberId, wabaId, code } = parsed.data

  // Exchange code → access token via Meta Graph API
  const appId     = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!appId || !appSecret) {
    console.error('[whatsapp/settings] META_APP_ID or META_APP_SECRET not set')
    return { error: 'הגדרות Meta חסרות בשרת — פנה למנהל המערכת' }
  }

  let accessToken: string
  try {
    accessToken = await exchangeCodeForToken(code, appId, appSecret)
  } catch (err) {
    console.error('[whatsapp/settings] Token exchange failed', { orgId, err })
    return { error: 'החלפת קוד ב-Token נכשלה — אנא נסה שנית' }
  }

  // Subscribe our app to the customer's WABA — without this, Meta never sends
  // message webhooks for this WABA, even though the app-level callback is set.
  // Must succeed before we persist the connection: saving an unsubscribed WABA
  // would look "connected" in the UI while receiving no messages.
  // The call is idempotent on Meta's side, so redoing the signup flow is safe.
  if (wabaId) {
    try {
      await subscribeAppToWABA(wabaId, accessToken)
    } catch (err) {
      console.error('[whatsapp/settings] WABA webhook subscription failed', { orgId, wabaId, err })
      return { error: 'רישום ה-webhook מול Meta נכשל — אנא נסה להתחבר שוב' }
    }
  } else {
    console.warn('[whatsapp/settings] No wabaId provided — skipping subscribed_apps registration', { orgId })
  }

  // Encrypt before storing
  let encryptedToken: string
  try {
    encryptedToken = encryptToken(accessToken)
  } catch (err) {
    console.error('[whatsapp/settings] Token encryption failed', { orgId, err })
    return { error: 'שגיאה בהצפנת ה-Token — בדוק שמפתח ההצפנה מוגדר' }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_access_token:    encryptedToken,
      whatsapp_waba_id:         wabaId ?? null,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[whatsapp/settings] DB update failed', { orgId, error: updateError.message })
    return { error: 'שגיאה בשמירת הנתונים' }
  }

  console.info('[whatsapp/settings] WhatsApp connected', { orgId, phoneNumberId, wabaId })

  // Register all message templates on the org's WABA (fire-and-forget)
  if (wabaId) {
    registerTemplatesForWABA(wabaId, accessToken).catch((err) =>
      console.error('[whatsapp/settings] Template registration failed', { orgId, err })
    )
  }

  revalidatePath('/settings/whatsapp')
  return { error: null }
}

// ── disconnectWhatsApp ────────────────────────────────────────────────────────

/**
 * Removes the org's WhatsApp phone_number_id and access token.
 * After disconnect, incoming webhook messages for this org's number will not
 * be routed (unknown phone_number_id → webhook logs a warning and returns 200).
 */
export async function disconnectWhatsApp(
  _prevState: WhatsAppActionResult,
  _formData: FormData
): Promise<WhatsAppActionResult> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[whatsapp/settings] Disconnect DB update failed', { orgId, error: updateError.message })
    return { error: 'שגיאה בניתוק החשבון' }
  }

  console.info('[whatsapp/settings] WhatsApp disconnected', { orgId })
  revalidatePath('/settings/whatsapp')
  return { error: null }
}

// ── Token exchange helper ─────────────────────────────────────────────────────

/**
 * Exchanges a Meta Embedded Signup OAuth code for a user access token.
 * POST https://graph.facebook.com/oauth/access_token
 */
async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const redirectUri = `${appUrl}/settings/whatsapp`

  const params = new URLSearchParams({
    client_id:     appId,
    client_secret: appSecret,
    redirect_uri:  redirectUri,
    code,
  })

  const res = await fetch(
    `https://graph.facebook.com/oauth/access_token?${params.toString()}`,
    { method: 'GET' }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Meta token exchange failed ${res.status}: ${body}`)
  }

  const json = await res.json() as { access_token?: string; error?: { message: string } }

  if (!json.access_token) {
    throw new Error(`Meta token exchange: no access_token in response — ${JSON.stringify(json)}`)
  }

  return json.access_token
}
