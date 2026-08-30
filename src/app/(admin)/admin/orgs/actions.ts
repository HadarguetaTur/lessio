'use server'

import { redirect } from 'next/navigation'
import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { createOrganization, CreateOrganizationSchema } from '@/lib/superadmin/createOrganization'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { zodError } from '@/lib/i18n/actionErrors'

export type ActionState = { error: string | null; success?: boolean } | null

export async function createOrganizationAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperAdminSession()

  const raw = {
    name: formData.get('name'),
    timezone: formData.get('timezone'),
    owner_email: formData.get('owner_email'),
    owner_full_name: formData.get('owner_full_name'),
  }

  const parsed = CreateOrganizationSchema.safeParse(raw)
  if (!parsed.success) {
    const first = await zodError(parsed.error.issues[0])
    return { error: first }
  }

  const result = await createOrganization(parsed.data)
  if (!result.success) return { error: result.error }

  redirect(`/admin/orgs/${result.orgId}`)
}

const UpdateOrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, digits, and hyphens'),
  timezone: z.string().min(1),
  break_duration_minutes: z.coerce.number().int().min(0),
  min_booking_notice_hours: z.coerce.number().int().min(0),
  billing_mode: z.enum(['monthly', 'per_lesson']),
})

export async function updateOrganizationAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  await requireSuperAdminSession()

  const raw = {
    id: formData.get('id'),
    name: formData.get('name'),
    slug: formData.get('slug'),
    timezone: formData.get('timezone'),
    break_duration_minutes: formData.get('break_duration_minutes'),
    min_booking_notice_hours: formData.get('min_booking_notice_hours'),
    billing_mode: formData.get('billing_mode'),
  }

  const parsed = UpdateOrgSchema.safeParse(raw)
  if (!parsed.success) {
    const first = await zodError(parsed.error.issues[0])
    return { error: first }
  }

  const { id, ...fields } = parsed.data

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update(fields)
    .eq('id', id)

  if (error) {
    console.error('[updateOrganizationAction] failed', { id, error })
    return { error: t('admin.errors.updateOrgFailed') }
  }

  return { error: null, success: true }
}
