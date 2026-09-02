'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSession, requireMutation } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getTeacherById, type Teacher } from '@/lib/teachers'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { requireQuotaCapacity } from '@/lib/saas/quota'
import { getTranslations } from 'next-intl/server'

type ActionState = { error: string } | null

/**
 * Normalizes an optional phone from a form field.
 * A teacher's phone is what the WhatsApp bot matches an inbound message
 * against (see resolveSender), so it must be stored in E.164 like every other
 * phone in the DB — an un-normalized "052-123-4567" would simply never match.
 */
// Sync, so it cannot await a translator — it returns a catalog key and the
// calling action resolves it.
function parseOptionalPhone(raw: FormDataEntryValue | null): { phone: string | null } | { errorKey: string } {
  const trimmed = ((raw as string) ?? '').trim()
  if (!trimmed) return { phone: null }
  try {
    return { phone: normalizePhone(trimmed) }
  } catch (err) {
    if (err instanceof PhoneNormalizationError) {
      return { errorKey: 'teachers.errors.invalidPhone' }
    }
    throw err
  }
}

/**
 * Invite flow (Decision #12):
 * 1. Send Supabase Auth invite via admin API (creates auth.users entry)
 * 2. Create profiles record with the returned user ID
 * 3. Create teachers record linked to that profile
 * All writes use service role — profile creation requires bypassing RLS.
 */
export async function inviteTeacher(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const email = (formData.get('email') as string).trim().toLowerCase()
  const full_name = (formData.get('full_name') as string).trim()

  if (!email) return { error: t('teachers.errors.emailRequired') }
  if (!full_name) return { error: t('teachers.errors.fullNameRequired') }

  const parsedPhone = parseOptionalPhone(formData.get('phone'))
  if ('errorKey' in parsedPhone) return { error: t(parsedPhone.errorKey) }

  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  // Seats are the value metric, so this is the check that makes the price real.
  //
  // It MUST run before inviteUserByEmail below. An invite that creates the
  // auth.users row and is then rejected burns the address permanently — the
  // retry after upgrading comes back "already been registered" and the customer
  // cannot add the teacher they just paid for.
  await requireQuotaCapacity(orgId, 'teachers')

  const adminClient = createServiceRoleClient()

  // Step 1: Send invite email via Supabase Auth admin API
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email)

  if (inviteError) {
    if (inviteError.message.includes('already been registered')) {
      return { error: t('teachers.errors.emailExists') }
    }
    return { error: t('teachers.errors.inviteFailed', { message: inviteError.message }) }
  }

  const userId = inviteData.user.id

  // Step 2: Create profile record
  const { error: profileError } = await adminClient.from('profiles').insert({
    id: userId,
    organization_id: orgId,
    full_name,
    phone: parsedPhone.phone,
    role: 'teacher',
  })

  if (profileError) {
    return { error: t('teachers.errors.createProfileFailed') }
  }

  // Step 3: Create teacher record linked to profile
  const { error: teacherError } = await adminClient.from('teachers').insert({
    organization_id: orgId,
    profile_id: userId,
  })

  if (teacherError) {
    return { error: t('teachers.errors.createTeacherFailed') }
  }

  redirect('/teachers')
}

export async function updateTeacher(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const bio = (formData.get('bio') as string).trim() || null
  const hourlyRateRaw = (formData.get('hourly_rate') as string).trim()
  const hourly_rate = hourlyRateRaw ? parseFloat(hourlyRateRaw) : null

  if (hourlyRateRaw && (isNaN(hourly_rate!) || hourly_rate! < 0)) {
    return { error: t('teachers.errors.ratePositive') }
  }

  const parsedPhone = parseOptionalPhone(formData.get('phone'))
  if ('errorKey' in parsedPhone) return { error: t(parsedPhone.errorKey) }

  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  const supabase = await createClient()

  const { error } = await supabase
    .from('teachers')
    .update({ bio, hourly_rate, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: t('teachers.errors.updateFailed') }

  // The phone lives on the linked profile, not on teachers. Service role: a
  // teacher's own profile row is not writable under the caller's RLS.
  const teacher = await getTeacherById(id, orgId)
  if (teacher) {
    const { error: profileError } = await createServiceRoleClient()
      .from('profiles')
      .update({ phone: parsedPhone.phone })
      .eq('id', teacher.profile.id)
      .eq('organization_id', orgId)

    if (profileError) {
      console.error('[teachers/updateTeacher] Failed to update profile phone', {
        orgId,
        teacherId: id,
        error: profileError,
      })
      return { error: t('teachers.errors.updateContactFailed') }
    }
  }

  revalidatePath('/teachers')
  revalidatePath(`/teachers/${id}/edit`)

  return null
}

export async function fetchTeacherForSheet(
  id: string
): Promise<{ data: Teacher } | { error: string }> {
  const t = await getTranslations()
  const { orgId } = await getSession()
  const teacher = await getTeacherById(id, orgId)
  if (!teacher) return { error: t('teachers.errors.notFound') }
  return { data: teacher }
}

export async function archiveTeacher(id: string): Promise<void> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()

  await supabase
    .from('teachers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/teachers')
  revalidatePath(`/teachers/${id}/edit`)
}

export async function restoreTeacher(id: string): Promise<void> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return

  // Un-archiving raises the active seat count exactly like an invite does, so
  // it is enforced the same way. `add = 1` is right: an archived teacher is not
  // currently counted. Throwing here (rather than the silent return above) is
  // deliberate — the dashboard error boundary turns it into the upgrade card.
  await requireQuotaCapacity(orgId, 'teachers')

  const supabase = await createClient()

  await supabase
    .from('teachers')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/teachers')
  revalidatePath(`/teachers/${id}/edit`)
}
