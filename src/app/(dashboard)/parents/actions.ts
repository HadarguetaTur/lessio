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
import { sendTextMessage } from '@/lib/whatsapp'
import { isOptedOut } from '@/lib/whatsapp/optOut'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { getTranslations } from 'next-intl/server'
import { commonError, zodError } from '@/lib/i18n/actionErrors'

type ActionState = { error: string } | null

const RELATION_VALUES = new Set(['mother', 'father', 'guardian', 'other'])

function relationTypeFromForm(formData: FormData): string | null {
  const raw = (formData.get('relation_type') as string | null)?.trim() ?? ''
  if (!raw) return null
  return RELATION_VALUES.has(raw) ? raw : null
}

// Sync, so it cannot await a translator — it returns a catalog key and the
// calling action resolves it.
function parseOptionalEmail(formData: FormData): { email: string | null; errorKey?: string } {
  const raw = (formData.get('email') as string | null)?.trim() ?? ''
  if (!raw) return { email: null }
  const r = z.string().email().safeParse(raw)
  if (!r.success) return { email: null, errorKey: 'parents.errors.invalidEmail' }
  return { email: r.data }
}

function parseOptionalSecondPhone(formData: FormData): { phone: string | null; errorKey?: string } {
  const raw = (formData.get('second_phone') as string | null)?.trim() ?? ''
  if (!raw) return { phone: null }
  try {
    return { phone: normalizePhone(raw) }
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { phone: null, errorKey: 'parents.errors.invalidSecondaryPhone' }
    }
    throw e
  }
}

export async function createParent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const full_name = (formData.get('full_name') as string).trim()
  const rawPhone = (formData.get('phone') as string).trim()
  const notes = (formData.get('notes') as string).trim() || null
  const address = (formData.get('address') as string).trim() || null
  const relation_type = relationTypeFromForm(formData)

  if (!full_name) return { error: t('parents.errors.fullNameRequired') }
  if (!rawPhone) return { error: t('parents.errors.phoneRequired') }

  const emailRes = parseOptionalEmail(formData)
  if (emailRes.errorKey) return { error: t(emailRes.errorKey) }

  const secondRes = parseOptionalSecondPhone(formData)
  if (secondRes.errorKey) return { error: t(secondRes.errorKey) }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: t('parents.errors.invalidPhone') }
    }
    return { error: t('parents.errors.phoneProcessing') }
  }

  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') return { error: await commonError('noPermission') }
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
      return { error: t('parents.errors.phoneExists') }
    }
    return { error: t('parents.errors.createFailed') }
  }

  redirect('/parents')
}

export async function updateParent(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const full_name = (formData.get('full_name') as string).trim()
  const rawPhone = (formData.get('phone') as string).trim()
  const notes = (formData.get('notes') as string).trim() || null
  const address = (formData.get('address') as string).trim() || null
  const relation_type = relationTypeFromForm(formData)

  if (!full_name) return { error: t('parents.errors.fullNameRequired') }
  if (!rawPhone) return { error: t('parents.errors.phoneRequired') }

  const emailRes = parseOptionalEmail(formData)
  if (emailRes.errorKey) return { error: t(emailRes.errorKey) }

  const secondRes = parseOptionalSecondPhone(formData)
  if (secondRes.errorKey) return { error: t(secondRes.errorKey) }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: t('parents.errors.invalidPhone') }
    }
    return { error: t('parents.errors.phoneProcessing') }
  }

  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') return { error: await commonError('noPermission') }
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
      return { error: t('parents.errors.phoneExists') }
    }
    return { error: t('parents.errors.updateFailed') }
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
  const t = await getTranslations()
  const full_name = (formData.get('full_name') as string ?? '').trim()
  const rawPhone = (formData.get('phone') as string ?? '').trim()
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const address = (formData.get('address') as string ?? '').trim() || null
  const relation_type = relationTypeFromForm(formData)

  if (!full_name) return { error: t('parents.errors.fullNameRequired') }
  if (!rawPhone) return { error: t('parents.errors.phoneRequired') }

  const emailRes = parseOptionalEmail(formData)
  if (emailRes.errorKey) return { error: t(emailRes.errorKey) }

  const secondRes = parseOptionalSecondPhone(formData)
  if (secondRes.errorKey) return { error: t(secondRes.errorKey) }

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof PhoneNormalizationError) {
      return { error: t('parents.errors.invalidPhone') }
    }
    return { error: t('parents.errors.phoneProcessing') }
  }

  const session = await getSession()
  if (session.role !== 'teacher') return { error: await commonError('noPermission') }

  const teacher = await getTeacherByProfileId(session.profileId, session.orgId, { activeOnly: true })
  if (!teacher) return { error: t('parents.errors.noTeacherProfile') }

  const ok = await assertTeacherCanAccessParent(parentId, session.orgId, teacher.id)
  if (!ok) return { error: t('parents.errors.cannotUpdateParent') }

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
    if (error.code === '23505') return { error: t('parents.errors.phoneExists') }
    return { error: t('parents.errors.updateFailed') }
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
  const t = await getTranslations()
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const { orgId, role, profileId } = await getSession()
  if (role !== 'teacher') return { error: await commonError('noPermission') }

  const teacher = await getTeacherByProfileId(profileId, orgId, { activeOnly: true })
  if (!teacher) return { error: t('parents.errors.noTeacherProfile') }

  const ok = await assertTeacherCanAccessParent(parentId, orgId, teacher.id)
  if (!ok) return { error: t('parents.errors.cannotUpdateParent') }

  const supabase = await createClient()
  const { error } = await supabase
    .from('parents')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', parentId)
    .eq('organization_id', orgId)

  if (error) return { error: t('parents.errors.notesUpdateFailed') }
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
  const t = await getTranslations()
  const { orgId, role, userId } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  // Load parent
  const parent = await getParentById(parentId, orgId)
  if (!parent) return { error: t('parents.errors.parentNotFound') }
  if (!parent.phone) return { error: t('parents.errors.parentNoPhone') }

  // A payment request is business-initiated, so the opt-out applies. This send
  // uses sendTextMessage directly rather than sendSmartMessage, which is where
  // the gate normally lives — hence the explicit check here.
  if (await isOptedOut(orgId, parent.phone)) {
    return { error: t('parents.optedOutError') }
  }

  // Load pending charges
  const charges = await getPendingChargesForParent(parentId, orgId)
  if (charges.length === 0) {
    return { error: t('parents.errors.noOpenCharges') }
  }

  // Load org config: per-org WhatsApp token (Sprint 7) + timezone
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token, timezone, default_locale')
    .eq('id', orgId)
    .single()

  const encryptedToken = org?.whatsapp_access_token as string | null
  const phoneNumberId = org?.whatsapp_phone_number_id as string | null
  const timezone = (org?.timezone as string | null) ?? 'Asia/Jerusalem'

  // The payment description and the WhatsApp body are both read by the parent,
  // so they follow the parent's language rather than the sender's.
  const recipientLocale = resolveRecipientLocale({
    stored: (parent as { preferred_locale?: string | null }).preferred_locale,
    orgDefault: org?.default_locale as string | null,
  })
  const tr = await getT('parents', recipientLocale)

  if (!encryptedToken || !phoneNumberId) {
    return { error: t('parents.errors.whatsappNotConnectedHint') }
  }

  let accessToken: string
  try {
    accessToken = decryptToken(encryptedToken)
  } catch (err) {
    console.error('[sendPaymentRequestAction] WhatsApp token decryption failed', { orgId, err })
    return { error: t('parents.errors.whatsappDecryptFailed') }
  }

  // Generate Cardcom payment link (fire-and-forget if provider not configured)
  let paymentUrl: string | null = null
  let paymentReference: string | null = null
  let paymentProviderName: string | null = null

  try {
    const { provider, providerName } = await getPaymentProvider(orgId)
    const totalAmount = charges.reduce((sum, c) => sum + c.amount, 0)
    const firstChargeId = charges[0]!.id
    const description = tr('chargeDescription', { name: parent.full_name as string })

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
  const message = buildPaymentRequestMessage(
    parent.full_name,
    charges,
    timezone,
    paymentUrl,
    recipientLocale
  )

  try {
    await sendTextMessage(parent.phone, message, accessToken, phoneNumberId)
  } catch (sendErr) {
    console.error('[sendPaymentRequestAction] WhatsApp API error', { orgId, parentId, error: String(sendErr) })
    return { error: t('parents.errors.whatsappSendFailed') }
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
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const [parent, linkedStudents, debt] = await Promise.all([
      getParentById(parentId, orgId),
      getParentStudents(parentId, orgId),
      getParentDebt(parentId, orgId),
    ])
    if (!parent) return { error: t('parents.errors.parentNotFound') }
    return { data: { parent, linkedStudents, debt } }
  } catch {
    return { error: t('parents.errors.loadParentFailed') }
  }
}
