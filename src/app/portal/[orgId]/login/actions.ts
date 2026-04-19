'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'
import { decryptToken } from '@/lib/crypto'
import { sendTextMessage } from '@/lib/whatsapp'
import { generateOtp, storeOtp, verifyOtp } from '@/lib/portal/otp'
import { setPortalSessionCookie } from '@/lib/portal/session'
import { requireFeature } from '@/lib/saas/featureGate'

const PhoneSchema = z.object({
  phone: z.string().min(9),
})

const OtpSchema = z.object({
  otp: z.string().length(6).regex(/^\d{6}$/),
})

export type LoginState = { error: string | null }

/**
 * Step 1 — receive phone, verify parent exists, send OTP via WhatsApp.
 * Bound to orgId via .bind() in the client form.
 */
export async function requestOtpAction(
  orgId: string,
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = PhoneSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'מספר טלפון לא תקין' }

  let phone: string
  try {
    phone = normalizePhone(parsed.data.phone)
  } catch {
    return { error: 'מספר טלפון לא תקין' }
  }

  const db = createServiceRoleClient()

  // Verify parent exists in this org
  const { data: parent } = await db
    .from('parents')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (!parent) {
    // Security: same message regardless of whether phone exists
    return { error: 'לא נמצא חשבון משויך למספר זה. פנה/י לבית הספר.' }
  }

  // Get org WhatsApp config
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', orgId)
    .single()

  if (!org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) {
    return { error: 'שירות הכניסה אינו זמין כרגע. פנה/י לבית הספר.' }
  }

  const otp = generateOtp()
  await storeOtp({ phone, orgId, otp })

  const accessToken = decryptToken(org.whatsapp_access_token as string)
  const message = `קוד הכניסה שלך ל-LESSIO: *${otp}*\nהקוד בתוקף ל-10 דקות.`

  try {
    await sendTextMessage(phone, message, accessToken, org.whatsapp_phone_number_id as string)
  } catch (err) {
    console.error('[requestOtpAction] Failed to send OTP via WhatsApp', { org_id: orgId, err })
    return { error: 'שגיאה בשליחת הקוד. נסה/י שוב.' }
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
  if (!parsed.success) return { error: 'קוד לא תקין — חייב להיות 6 ספרות' }

  const valid = await verifyOtp({ phone, orgId, otp: parsed.data.otp })
  if (!valid) return { error: 'קוד שגוי או שפג תוקפו. חזור/י ובקש/י קוד חדש.' }

  const db = createServiceRoleClient()
  const { data: parent } = await db
    .from('parents')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .single()

  if (!parent) return { error: 'שגיאה — נסה/י שוב' }

  await setPortalSessionCookie({ parentId: parent.id, orgId })
  redirect(`/portal/${orgId}/home`)
}
