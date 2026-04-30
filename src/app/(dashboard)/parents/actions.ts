'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getPendingChargesForParent, buildPaymentRequestMessage, logPaymentRequestSent } from '@/lib/payment-request'
import { getParentById, type Parent } from '@/lib/parents'
import { getParentStudents, type ParentStudent } from '@/lib/relationships'
import { getParentDebt } from '@/lib/charges'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getPaymentProvider } from '@/lib/payments/factory'
import { PaymentProviderNotConfiguredError } from '@/lib/payments'
import { decryptToken } from '@/lib/crypto'

type ActionState = { error: string } | null

const RELATION_VALUES = new Set(['mother', 'father', 'guardian', 'other'])

function relationTypeFromForm(formData: FormData): string | null {
  const raw = (formData.get('relation_type') as string | null)?.trim() ?? ''
  if (!raw) return null
  return RELATION_VALUES.has(raw) ? raw : null
}

function parseOptionalEmail(formData: FormData): { email: string | null; error?: string } {
  const raw = (formData.get('email') as string | null)?.trim() ?? ''
  if (!raw) return { email: null }
  const r = z.string().email().safeParse(raw)
  if (!r.success) return { email: null, error: 'כתובת אימייל לא תקינה' }
  return { email: r.data }
}

function parseOptionalSecondPhone(formData: FormData): { phone: string | null; error?: string } {
  const raw = (formData.get('second_phone') as string | null)?.trim() ?? ''
  if (!raw) return { phone: null }
  try {
    return { phone: normalizePhone(raw) }
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { phone: null, error: 'מספר טלפון נוסף לא תקין' }
    }
    throw e
  }
}

export async function createParent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const full_name = (formData.get('full_name') as string).trim()
  const rawPhone = (formData.get('phone') as string).trim()
  const notes = (formData.get('notes') as string).trim() || null
  const address = (formData.get('address') as string).trim() || null
  const relation_type = relationTypeFromForm(formData)

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }
  if (!rawPhone) return { error: 'מספר טלפון הוא שדה חובה' }

  const emailRes = parseOptionalEmail(formData)
  if (emailRes.error) return { error: emailRes.error }

  const secondRes = parseOptionalSecondPhone(formData)
  if (secondRes.error) return { error: secondRes.error }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: 'מספר טלפון לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
    }
    return { error: 'שגיאה בעיבוד מספר הטלפון' }
  }

  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }
  requireMutation(session)

  const supabase = await createClient()

  const { error } = await supabase
    .from('parents')
    .insert({
      organization_id: session.orgId,
      full_name,
      phone,
      notes,
      email: emailRes.email,
      second_phone: secondRes.phone,
      address,
      relation_type,
    })

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
  const address = (formData.get('address') as string).trim() || null
  const relation_type = relationTypeFromForm(formData)

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }
  if (!rawPhone) return { error: 'מספר טלפון הוא שדה חובה' }

  const emailRes = parseOptionalEmail(formData)
  if (emailRes.error) return { error: emailRes.error }

  const secondRes = parseOptionalSecondPhone(formData)
  if (secondRes.error) return { error: secondRes.error }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: 'מספר טלפון לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
    }
    return { error: 'שגיאה בעיבוד מספר הטלפון' }
  }

  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }
  requireMutation(session)

  const supabase = await createClient()

  const { error } = await supabase
    .from('parents')
    .update({
      full_name,
      phone,
      notes,
      email: emailRes.email,
      second_phone: secondRes.phone,
      address,
      relation_type,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', session.orgId)

  if (error) {
    if (error.code === '23505') {
      return { error: 'מספר טלפון זה כבר קיים במערכת' }
    }
    return { error: 'שגיאה בעדכון ההורה' }
  }

  redirect('/parents')
}

async function assertTeacherCanAccessParent(
  parentId: string,
  orgId: string,
  teacherId: string
): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data: rels } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', parentId)
    .eq('organization_id', orgId)
  const studentIds = [...new Set((rels ?? []).map((r) => r.student_id as string))]
  if (studentIds.length === 0) return false

  const { data: students } = await db
    .from('students')
    .select('id, teacher_id')
    .in('id', studentIds)
    .eq('organization_id', orgId)
  if (students?.some((s) => s.teacher_id === teacherId)) return true

  const { data: lsRows } = await db
    .from('lesson_students')
    .select('lesson_id')
    .in('student_id', studentIds)
  const lessonIds = [...new Set((lsRows ?? []).map((r) => r.lesson_id as string))]
  if (lessonIds.length === 0) return false

  const { data: lessons } = await db
    .from('lessons')
    .select('id')
    .in('id', lessonIds)
    .eq('organization_id', orgId)
    .eq('teacher_id', teacherId)
  return (lessons?.length ?? 0) > 0
}

/** Teacher: update full contact details for parents linked to their students. */
export async function updateParentAsTeacher(
  parentId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const full_name = (formData.get('full_name') as string ?? '').trim()
  const rawPhone = (formData.get('phone') as string ?? '').trim()
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const address = (formData.get('address') as string ?? '').trim() || null
  const relation_type = relationTypeFromForm(formData)

  if (!full_name) return { error: 'שם מלא הוא שדה חובה' }
  if (!rawPhone) return { error: 'מספר טלפון הוא שדה חובה' }

  const emailRes = parseOptionalEmail(formData)
  if (emailRes.error) return { error: emailRes.error }

  const secondRes = parseOptionalSecondPhone(formData)
  if (secondRes.error) return { error: secondRes.error }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: 'מספר טלפון לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
    }
    return { error: 'שגיאה בעיבוד מספר הטלפון' }
  }

  const session = await getSession()
  if (session.role !== 'teacher') return { error: 'אין הרשאה לביצוע פעולה זו' }

  const teacher = await getTeacherByProfileId(session.profileId, session.orgId, { activeOnly: true })
  if (!teacher) return { error: 'לא נמצא פרופיל מורה פעיל' }

  const ok = await assertTeacherCanAccessParent(parentId, session.orgId, teacher.id)
  if (!ok) return { error: 'אין הרשאה לעדכן הורה זה' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('parents')
    .update({
      full_name,
      phone,
      notes,
      email: emailRes.email,
      second_phone: secondRes.phone,
      address,
      relation_type,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parentId)
    .eq('organization_id', session.orgId)

  if (error) {
    if (error.code === '23505') return { error: 'מספר טלפון זה כבר קיים במערכת' }
    return { error: 'שגיאה בעדכון ההורה' }
  }
  revalidatePath('/parents')
  return null
}

/** Teacher: update notes only for parents linked to their students. */
export async function updateParentNotesAsTeacher(
  parentId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const { orgId, role, profileId } = await getSession()
  if (role !== 'teacher') return { error: 'אין הרשאה לביצוע פעולה זו' }

  const teacher = await getTeacherByProfileId(profileId, orgId, { activeOnly: true })
  if (!teacher) return { error: 'לא נמצא פרופיל מורה פעיל' }

  const ok = await assertTeacherCanAccessParent(parentId, orgId, teacher.id)
  if (!ok) return { error: 'אין הרשאה לעדכן הורה זה' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('parents')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', parentId)
    .eq('organization_id', orgId)

  if (error) return { error: 'שגיאה בעדכון ההערות' }
  revalidatePath('/parents')
  return null
}

export async function archiveParent(id: string): Promise<void> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()

  await supabase
    .from('parents')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/parents')
}

export async function restoreParent(id: string): Promise<void> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session
  if (role !== 'owner' && role !== 'admin') return

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

  // Load org config: per-org WhatsApp token (Sprint 7) + timezone
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token, timezone')
    .eq('id', orgId)
    .single()

  const encryptedToken = org?.whatsapp_access_token as string | null
  const phoneNumberId = org?.whatsapp_phone_number_id as string | null
  const timezone = (org?.timezone as string | null) ?? 'Asia/Jerusalem'

  if (!encryptedToken || !phoneNumberId) {
    return { error: 'WhatsApp אינו מחובר. אנא הגדר/י את חיבור WhatsApp בהגדרות.' }
  }

  let accessToken: string
  try {
    accessToken = decryptToken(encryptedToken)
  } catch (err) {
    console.error('[sendPaymentRequestAction] WhatsApp token decryption failed', { orgId, err })
    return { error: 'שגיאה בפענוח token של WhatsApp — פנה/י למנהל המערכת' }
  }

  // Generate Cardcom payment link (fire-and-forget if provider not configured)
  let paymentUrl: string | null = null
  let paymentReference: string | null = null
  let paymentProviderName: string | null = null

  try {
    const { provider, providerName } = await getPaymentProvider(orgId)
    const totalAmount = charges.reduce((sum, c) => sum + c.amount, 0)
    const firstChargeId = charges[0]!.id
    const description = `חיוב עבור ${parent.full_name}`

    const result = await provider.createPaymentLink({
      chargeId: firstChargeId,
      amount: totalAmount,
      description,
      orgId,
    })

    paymentUrl = result.url
    paymentReference = result.reference
    paymentProviderName = providerName

    // Save payment link + reference on all pending charges (same link covers the total)
    await db
      .from('charges')
      .update({
        payment_link: paymentUrl,
        payment_reference: paymentReference,
        payment_provider: paymentProviderName,
        updated_at: new Date().toISOString(),
      })
      .in('id', charges.map(c => c.id))
      .eq('organization_id', orgId)

    console.info('[sendPaymentRequestAction] Payment link created', {
      orgId,
      parentId,
      chargeIds: charges.map(c => c.id),
      providerName,
    })
  } catch (err) {
    if (err instanceof PaymentProviderNotConfiguredError) {
      console.info('[sendPaymentRequestAction] No payment provider configured, sending message without link', { orgId })
    } else {
      console.error('[sendPaymentRequestAction] Payment link creation failed', { orgId, parentId, err })
    }
    // Continue sending the WhatsApp message even if the payment link fails
  }

  // Build and send WhatsApp message
  const message = buildPaymentRequestMessage(parent.full_name, charges, timezone, paymentUrl)

  const META_API_VERSION = 'v19.0'
  const whatsappUrl = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`

  const res = await fetch(whatsappUrl, {
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
    const detail = await res.text().catch(() => '')
    console.error('[sendPaymentRequestAction] WhatsApp API error', { orgId, parentId, status: res.status, detail })
    return { error: 'שגיאה בשליחת ההודעה דרך WhatsApp' }
  }

  // Log sent metadata on all included charges (idempotent)
  await logPaymentRequestSent(charges.map(c => c.id), orgId, userId).catch(err => {
    console.error('[sendPaymentRequestAction] Failed to log payment request metadata', { orgId, parentId, chargeIds: charges.map(c => c.id), err })
  })

  revalidatePath('/charges')
  revalidatePath('/parents')
  return { error: null }
}

// ── Sheet lazy-load ───────────────────────────────────────────────────────────

export interface ParentSheetData {
  parent: Parent
  linkedStudents: ParentStudent[]
  debt: number
}

export async function fetchParentForSheet(
  parentId: string
): Promise<{ data: ParentSheetData } | { error: string }> {
  try {
    const { orgId } = await getSession()
    const [parent, linkedStudents, debt] = await Promise.all([
      getParentById(parentId, orgId),
      getParentStudents(parentId, orgId),
      getParentDebt(parentId, orgId),
    ])
    if (!parent) return { error: 'הורה לא נמצא' }
    return { data: { parent, linkedStudents, debt } }
  } catch {
    return { error: 'שגיאה בטעינת פרטי ההורה' }
  }
}
