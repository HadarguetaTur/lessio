'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getOrgSubscriptionState } from '@/lib/saas/subscriptions'

async function getOrgSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) throw new Error('No profile')

  return { userId: user.id, orgId: profile.organization_id as string, role: profile.role }
}

export async function updateOrgSettings(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const t = await getTranslations('onboarding')
  const { orgId, role } = await getOrgSession()
  if (role !== 'owner' && role !== 'admin') return { error: t('errors.noPermission') }

  const timezone = (formData.get('timezone') as string)?.trim() || 'Asia/Jerusalem'
  const billingMode = (formData.get('billing_mode') as string) || 'monthly'

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({ timezone, billing_mode: billingMode })
    .eq('id', orgId)

  if (error) return { error: t('errors.settingsUpdateFailed') }
  revalidatePath('/onboarding')
  return null
}

export async function addTeacher(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const t = await getTranslations('onboarding')
  const { orgId, role } = await getOrgSession()
  if (role !== 'owner' && role !== 'admin') return { error: t('errors.noPermission') }

  const fullName = (formData.get('full_name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()

  if (!fullName || !email) return { error: t('errors.fullNameEmailRequired') }

  const db = createServiceRoleClient()

  // Invite via Supabase Auth
  const { data: inviteData, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  })

  if (inviteError || !inviteData?.user) {
    const msg = inviteError?.message ?? ''
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return { error: t('errors.emailAlreadyRegistered') }
    }
    return { error: t('errors.inviteFailed', { message: msg }) }
  }

  const teacherUserId = inviteData.user.id

  // Create profile
  const { error: profileError } = await db.from('profiles').insert({
    id: teacherUserId,
    organization_id: orgId,
    full_name: fullName,
    role: 'teacher',
    is_active: true,
  })

  if (profileError) {
    await db.auth.admin.deleteUser(teacherUserId)
    return { error: t('errors.teacherProfileError') }
  }

  // Create teacher record
  const { error: teacherError } = await db.from('teachers').insert({
    organization_id: orgId,
    profile_id: teacherUserId,
  })

  if (teacherError) {
    await db.auth.admin.deleteUser(teacherUserId)
    return { error: t('errors.teacherRecordError') }
  }

  revalidatePath('/onboarding')
  return null
}

export async function createOwnerTeacher(): Promise<{ error: string } | null> {
  const t = await getTranslations('onboarding')
  const { userId, orgId, role } = await getOrgSession()
  if (role !== 'owner') return { error: t('errors.noPermission') }

  const db = createServiceRoleClient()

  // Check if owner already has a teacher record
  const { data: existing } = await db
    .from('teachers')
    .select('id')
    .eq('organization_id', orgId)
    .eq('profile_id', userId)
    .maybeSingle()

  if (existing) return null

  const { error } = await db.from('teachers').insert({
    organization_id: orgId,
    profile_id: userId,
  })

  if (error) return { error: t('errors.teacherRecordError') }
  revalidatePath('/onboarding')
  return null
}

export async function updateBasicSettings(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const t = await getTranslations('onboarding')
  const { orgId, role } = await getOrgSession()
  if (role !== 'owner' && role !== 'admin') return { error: t('errors.noPermission') }

  const noticeHoursFull = parseInt(formData.get('notice_hours') as string) || 24
  const chargePercent = parseInt(formData.get('charge_percent') as string) || 50
  const lessonReminderHours = parseInt(formData.get('lesson_reminder_hours') as string) || 24
  const paymentReminderDays = parseInt(formData.get('payment_reminder_days') as string) || 7

  const db = createServiceRoleClient()

  // Update cancellation policy
  const { error: policyError } = await db
    .from('cancellation_policies')
    .update({
      notice_hours_full: noticeHoursFull,
      notice_hours_partial: 2,
      partial_charge_percent: chargePercent,
    })
    .eq('organization_id', orgId)

  if (policyError) return { error: t('errors.cancellationPolicyUpdateFailed') }

  // Update reminders
  const { error: orgError } = await db
    .from('organizations')
    .update({
      lesson_reminder_hours: lessonReminderHours,
      payment_reminder_days: paymentReminderDays,
    })
    .eq('id', orgId)

  if (orgError) return { error: t('errors.remindersUpdateFailed') }

  revalidatePath('/onboarding')
  return null
}

export async function completeOnboarding(): Promise<void> {
  const { orgId } = await getOrgSession()
  const db = createServiceRoleClient()

  const state = await getOrgSubscriptionState(orgId)
  if (state?.status === 'pending_payment') {
    redirect('/onboarding')
  }
  if (
    state &&
    state.status !== 'trial' &&
    state.status !== 'active' &&
    state.status !== 'read_only'
  ) {
    redirect('/onboarding')
  }

  await db
    .from('organizations')
    .update({ onboarding_completed: true })
    .eq('id', orgId)

  redirect('/dashboard')
}
