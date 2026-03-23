'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getPendingChargesForParent, buildPaymentRequestMessage, logPaymentRequestSent } from '@/lib/payment-request'
import { getParentById } from '@/lib/parents'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type ActionState = { error: string } | null

export async function createParent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const full_name = (formData.get('full_name') as string).trim()
  const rawPhone = (formData.get('phone') as string).trim()
  const notes = (formData.get('notes') as string).trim() || null

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }
  if (!rawPhone) return { error: 'מספר טלפון הוא שדה חובה' }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: 'מספר טלפון לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
    }
    return { error: 'שגיאה בעיבוד מספר הטלפון' }
  }

  const { orgId } = await getSession()
  const supabase = await createClient()

  const { error } = await supabase
    .from('parents')
    .insert({ organization_id: orgId, full_name, phone, notes })

  if (error) {
    if (error.code === '23505') {
      return { error: 'מספר טלפון זה כבר קיים במערכת' }
    }
    return { error: 'שגיאה ביצירת ההורה' }
  }

  redirect('/parents')
}

export async function updateParent(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const full_name = (formData.get('full_name') as string).trim()
  const rawPhone = (formData.get('phone') as string).trim()
  const notes = (formData.get('notes') as string).trim() || null

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }
  if (!rawPhone) return { error: 'מספר טלפון הוא שדה חובה' }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: 'מספר טלפון לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
    }
    return { error: 'שגיאה בעיבוד מספר הטלפון' }
  }

  const { orgId } = await getSession()
  const supabase = await createClient()

  const { error } = await supabase
    .from('parents')
    .update({ full_name, phone, notes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) {
    if (error.code === '23505') {
      return { error: 'מספר טלפון זה כבר קיים במערכת' }
    }
    return { error: 'שגיאה בעדכון ההורה' }
  }

  redirect('/parents')
}

export async function archiveParent(id: string): Promise<void> {
  const { orgId } = await getSession()
  const supabase = await createClient()

  await supabase
    .from('parents')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/parents')
}

export async function restoreParent(id: string): Promise<void> {
  const { orgId } = await getSession()
  const supabase = await createClient()

  await supabase
    .from('parents')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/parents')
}

export async function sendPaymentRequestAction(
  parentId: string
): Promise<{ error: string | null }> {
  const { orgId, role, userId } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  // Load parent
  const parent = await getParentById(parentId, orgId)
  if (!parent) return { error: 'הורה לא נמצא' }
  if (!parent.phone) return { error: 'להורה אין מספר טלפון מוגדר' }

  // Load pending charges
  const charges = await getPendingChargesForParent(parentId, orgId)
  if (charges.length === 0) {
    return { error: 'אין חיובים פתוחים עבור הורה זה' }
  }

  // Load org WhatsApp config + timezone
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_token, timezone')
    .eq('id', orgId)
    .single()

  const accessToken = (org?.whatsapp_token as string | null) ?? process.env.WHATSAPP_ACCESS_TOKEN ?? ''
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? ''
  const timezone = (org?.timezone as string | null) ?? 'Asia/Jerusalem'

  if (!accessToken || !phoneNumberId) {
    return { error: 'הגדרות WhatsApp חסרות. אנא פנה/י למנהל המערכת.' }
  }

  // Build and send message
  const message = buildPaymentRequestMessage(parent.full_name, charges, timezone)

  const META_API_VERSION = 'v19.0'
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: parent.phone,
      type: 'text',
      text: { body: message },
    }),
  })

  if (!res.ok) {
    console.error('[sendPaymentRequestAction] WhatsApp API error', res.status)
    return { error: 'שגיאה בשליחת ההודעה דרך WhatsApp' }
  }

  // Log sent metadata on all included charges (idempotent)
  await logPaymentRequestSent(charges.map(c => c.id), orgId, userId)

  revalidatePath('/charges')
  revalidatePath('/parents')
  return { error: null }
}
