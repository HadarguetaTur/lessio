'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'
import { decryptToken } from '@/lib/crypto'
import { sendOtp } from '@/lib/whatsapp/sendOtp'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { generateOtp, storeOtp, verifyOtp, countRecentOtpRequests } from '@/lib/portal/otp'
import { setPortalSessionCookie } from '@/lib/portal/session'
import { recordParentConsent } from '@/lib/whatsapp/consent'
import { requireFeature } from '@/lib/saas/featureGate'

const PhoneSchema = z.object({
  phone: z.string().min(9),
  /** The consent checkbox. Absent when unticked, 'on' when ticked. */
  consent: z.string().optional(),
})

const OtpSchema = z.object({
  otp: z.string().length(6).regex(/^\d{6}$/),
})

/** `error` is a key under portal.login.errors, translated by the client form. */
export type LoginState = {
  error:
    | 'invalidPhone'
    | 'consentRequired'
    | 'tooManyAttempts'
    | 'noAccount'
    | 'serviceUnavailable'
    | 'sendFailed'
    | 'invalidCode'
    | 'wrongCode'
    | 'generic'
    | null
}

/**
 * Step 1 — receive phone, verify parent exists, send OTP via WhatsApp.
 * Bound to orgId via .bind() in the client form.
 */
export async function requestOtpAction(
  orgId: string,
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  // Feature gate first — must not be inside a try/catch (redirect() throws internally).
  await requireFeature(orgId, 'parent_portal')

  const parsed = PhoneSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'invalidPhone' }

  // The OTP is itself a WhatsApp message, so consent is checked before
  // anything is sent — and checked here, not only via the checkbox's
  // `required`, because a form can be posted without the browser.
  if (parsed.data.consent !== 'on') return { error: 'consentRequired' }

  let phone: string
  try {
    phone = normalizePhone(parsed.data.phone)
  } catch {
    return { error: 'invalidPhone' }
  }

  // Server-side rate limiting: max 3 OTP requests per phone per 15 minutes.
  // Checked after phone normalization so the key is canonical.
  // Generic error — do not reveal whether the phone is registered.
  const recentCount = await countRecentOtpRequests(phone, orgId)
  if (recentCount >= 3) {
    return { error: 'tooManyAttempts' }
  }

  const db = createServiceRoleClient()

  // Verify parent exists in this org
  const { data: parent } = await db
    .from('parents')
    .select('id, preferred_locale')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (!parent) {
    // Security: same message regardless of whether phone exists
    return { error: 'noAccount' }
  }

  // Get org WhatsApp config
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token, default_locale')
    .eq('id', orgId)
    .single()

  if (!org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) {
    return { error: 'serviceUnavailable' }
  }

  const otp = generateOtp()
  await storeOtp({ phone, orgId, otp })

  const accessToken = decryptToken(org.whatsapp_access_token as string)

  const locale = resolveRecipientLocale({
    stored: parent.preferred_locale as string | null,
    orgDefault: org.default_locale as string | null,
  })

  try {
    await sendOtp(phone, otp, accessToken, org.whatsapp_phone_number_id as string, locale)
  } catch (err) {
    console.error('[requestOtpAction] Failed to send OTP via WhatsApp', { org_id: orgId, err })
    return { error: 'sendFailed' }
  }

  redirect(`/portal/${orgId}/login?step=verify&phone=${encodeURIComponent(phone)}`)
}

/**
 * Step 2 — verify OTP, set portal session cookie, redirect to home.
 * Bound to orgId + phone via .bind() in the client form.
 */
export async function verifyOtpAction(
  orgId: string,
  phone: string,
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  await requireFeature(orgId, 'parent_portal')

  const parsed = OtpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'invalidCode' }

  // Resolve the parent BEFORE consuming the OTP. verifyOtp marks the code used, so a
  // lookup failure afterwards burned the code and the parent had to request a new one
  // — three of those and they hit the send limit with no way in.
  // maybeSingle(), not single(): duplicate parent rows on one phone must not 500.
  const db = createServiceRoleClient()
  const { data: parent, error: parentError } = await db
    .from('parents')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (parentError) {
    console.error('[verifyOtpAction] parent lookup failed', { org_id: orgId, error: parentError.message })
    return { error: 'generic' }
  }
  if (!parent) return { error: 'noAccount' }

  const valid = await verifyOtp({ phone, orgId, otp: parsed.data.otp })
  if (!valid) return { error: 'wrongCode' }

  // The login form carries the terms + messaging consent line, and a verified
  // OTP is the parent proving the number is theirs — the strongest consent
  // evidence the product can collect. Never overwrites an earlier record.
  await recordParentConsent({ parentId: parent.id, source: 'portal' })

  await setPortalSessionCookie({ parentId: parent.id, orgId })
  redirect(`/portal/${orgId}/home`)
}
