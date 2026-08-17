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
 *
 * registerTemplates — re-runs template registration on the already connected
 *   WABA and reports the outcome. Registration also happens automatically at
 *   signup, but fire-and-forget: when it fails there the org never finds out.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { encryptToken, decryptToken } from '@/lib/crypto'
import { registerTemplatesForWABA } from '@/lib/whatsapp/registerTemplates'
import { subscribeAppToWABA, unsubscribeAppFromWABA } from '@/lib/whatsapp/subscribeApp'
import { commonError } from '@/lib/i18n/actionErrors'

// ── Zod schemas ───────────────────────────────────────────────────────────────

// wabaId is required: without it we cannot subscribe the WABA to our webhook
// or register templates, leaving a "deaf" connection that looks connected but
// never receives messages.
const SaveSchema = z.object({
  phoneNumberId: z.string().min(1, 'phone_number_id is required'),
  wabaId:        z.string().min(1, 'חיבור ל-Meta לא החזיר מזהה חשבון WhatsApp Business — נסי להתחבר מחדש'),
  code:          z.string().min(1, 'OAuth code is required'),
})

// ── Result types ──────────────────────────────────────────────────────────────

export type WhatsAppActionResult = {
  error: string | null
}

export type RegisterTemplatesResult = {
  error: string | null
  /** Names of templates that now exist on the WABA — newly created or already there. */
  registered: string[]
  /** Templates Meta refused, with its reason. Surfaced, never swallowed. */
  failed: Array<{ name: string; reason: string }>
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
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const parsed = SaveSchema.safeParse({
    phoneNumberId: formData.get('phoneNumberId'),
    wabaId:        formData.get('wabaId') ?? '',
    code:          formData.get('code'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? await commonError('invalidData') }
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
  try {
    await subscribeAppToWABA(wabaId, accessToken)
  } catch (err) {
    console.error('[whatsapp/settings] WABA webhook subscription failed', { orgId, wabaId, err })
    return { error: 'רישום ה-webhook מול Meta נכשל — אנא נסה להתחבר שוב' }
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
      whatsapp_waba_id:         wabaId,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[whatsapp/settings] DB update failed', { orgId, error: updateError.message })
    return { error: 'שגיאה בשמירת הנתונים' }
  }

  console.info('[whatsapp/settings] WhatsApp connected', { orgId, phoneNumberId, wabaId })

  // Register all message templates on the org's WABA (fire-and-forget)
  registerTemplatesForWABA(wabaId, accessToken).catch((err) =>
    console.error('[whatsapp/settings] Template registration failed', { orgId, err })
  )

  revalidatePath('/settings/whatsapp')
  return { error: null }
}

// ── disconnectWhatsApp ────────────────────────────────────────────────────────

/**
 * Removes the org's WhatsApp phone_number_id, access token and WABA id.
 * Best-effort unsubscribes the WABA from our app first so Meta stops
 * dispatching webhooks for a phone_number_id we can no longer route.
 * A Meta API failure never blocks the disconnect — the token may already be
 * revoked on Meta's side.
 */
export async function disconnectWhatsApp(
  _prevState: WhatsAppActionResult,
  _formData: FormData
): Promise<WhatsAppActionResult> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const db = createServiceRoleClient()

  // Best-effort: unsubscribe the WABA from our app before clearing credentials
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_waba_id, whatsapp_access_token')
    .eq('id', orgId)
    .maybeSingle()

  if (org?.whatsapp_waba_id && org?.whatsapp_access_token) {
    try {
      const accessToken = decryptToken(org.whatsapp_access_token)
      await unsubscribeAppFromWABA(org.whatsapp_waba_id, accessToken)
    } catch (err) {
      console.error('[whatsapp/settings] WABA unsubscribe failed — continuing disconnect', {
        orgId,
        wabaId: org.whatsapp_waba_id,
        err,
      })
    }
  }

  const { error: updateError } = await db
    .from('organizations')
    .update({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      whatsapp_waba_id: null,
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

// ── registerTemplates ─────────────────────────────────────────────────────────

/**
 * Registers Lessio's message templates on the org's already connected WABA.
 *
 * saveWhatsAppConnection does this too, but fire-and-forget — a failure there is
 * invisible to the org and there is no way to retry short of disconnecting and
 * redoing Embedded Signup. This is that retry, and it reports what happened.
 *
 * Unlike the sibling actions, `error` carries a stable code rather than a
 * user-facing sentence: the button renders in the viewer's own language, and
 * this screen is recorded in English for Meta's App Review screencast.
 */
export async function registerTemplates(
  _prevState: RegisterTemplatesResult,
  _formData: FormData
): Promise<RegisterTemplatesResult> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  const empty = { registered: [], failed: [] }

  if (role !== 'owner') {
    return { error: 'forbidden', ...empty }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_waba_id, whatsapp_access_token')
    .eq('id', orgId)
    .maybeSingle()

  if (!org?.whatsapp_waba_id || !org?.whatsapp_access_token) {
    return { error: 'notConnected', ...empty }
  }

  let accessToken: string
  try {
    accessToken = decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[whatsapp/settings] Token decryption failed', { orgId, err })
    return { error: 'decryptFailed', ...empty }
  }

  // Awaited, unlike at signup: the whole point here is showing the outcome.
  let result: Awaited<ReturnType<typeof registerTemplatesForWABA>>
  try {
    result = await registerTemplatesForWABA(org.whatsapp_waba_id, accessToken)
  } catch (err) {
    console.error('[whatsapp/settings] Template registration failed', { orgId, err })
    return { error: 'registerFailed', ...empty }
  }

  console.info('[whatsapp/settings] Templates registered on demand', {
    orgId,
    wabaId: org.whatsapp_waba_id,
    ok: result.ok.length,
    failed: result.failed.length,
  })

  return { error: null, registered: result.ok, failed: result.failed }
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
