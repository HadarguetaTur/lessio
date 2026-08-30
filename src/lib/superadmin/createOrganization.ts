/**
 * Superadmin: create a new organization with owner invite.
 * Resilient multi-step flow with compensating cleanup on failure.
 *
 * Steps:
 *  1. Validate input (Zod)
 *  2. Generate unique slug
 *  3. Insert organizations row
 *  4. Insert default cancellation_policies row
 *  5. Invite owner via Supabase Auth Admin API
 *  6. Insert profiles row (role = 'owner')
 *  → redirect to /admin/orgs/[id]
 *
 * Compensating behavior:
 *  - Invite fails → delete org
 *  - Profile insert fails → delete invited user + delete org
 *
 * Per /docs/sprint-18-scope.md § Story 4.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { syncOrgHolidays } from '@/lib/holidays/syncOrgHolidays'
import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { provisionProgressiveSetup } from '@/lib/auth/createOrgWithOwner'

export const CreateOrganizationSchema = z.object({
  name: z.string().min(2, 'validation.nameMin2'),
  timezone: z.string().min(1, 'validation.timezoneRequired'),
  owner_email: z.string().email('validation.invalidEmail'),
  owner_full_name: z.string().min(2, 'validation.fullNameMin2'),
})

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>

export type CreateOrganizationResult =
  | { success: true; orgId: string }
  | { success: false; error: string }

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0590-\u05ff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

async function uniqueSlug(db: ReturnType<typeof createServiceRoleClient>, base: string): Promise<string> {
  let candidate = base || 'org'
  let attempt = 0
  while (true) {
    const slug = attempt === 0 ? candidate : `${candidate}-${attempt}`
    const { data } = await db
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return slug
    attempt++
  }
}

export async function createOrganization(
  input: CreateOrganizationInput
): Promise<CreateOrganizationResult> {
  const t = await getTranslations()
  const db = createServiceRoleClient()

  // Step 2 — slug
  const slug = await uniqueSlug(db, toSlug(input.name))

  // Step 3 — insert org
  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert({
      name: input.name,
      slug,
      timezone: input.timezone,
      break_duration_minutes: 0,
      min_booking_notice_hours: 0,
      billing_mode: 'monthly',
      onboarding_completed: true,
    })
    .select('id')
    .single()

  if (orgError || !org) {
    console.error('[createOrganization] org insert failed', { error: orgError })
    return { success: false, error: t('admin.errors.createOrgFailed') }
  }

  const orgId = org.id

  // Step 4 — default cancellation policy
  await db.from('cancellation_policies').insert({
    organization_id: orgId,
    notice_hours_full: 24,
    notice_hours_partial: 2,
    partial_charge_percent: 50,
  })

  // Step 4b — seed upcoming Jewish holidays (non-fatal)
  try {
    await syncOrgHolidays(db, orgId)
  } catch (e) {
    console.error('[createOrganization] holiday seed failed', { orgId, error: e })
  }

  // Step 5 — invite owner via Auth Admin API
  const { data: inviteData, error: inviteError } =
    await db.auth.admin.inviteUserByEmail(input.owner_email, {
      data: { full_name: input.owner_full_name },
    })

  if (inviteError || !inviteData?.user) {
    console.error('[createOrganization] invite failed', { orgId, error: inviteError })
    // Compensate: delete org (cascades cancellation_policies)
    await db.from('organizations').delete().eq('id', orgId)
    return { success: false, error: t('admin.errors.inviteFailed', { message: inviteError?.message ?? t('admin.errors.unknownError') }) }
  }

  const ownerId = inviteData.user.id

  // Step 6 — insert profile
  const { error: profileError } = await db.from('profiles').insert({
    id: ownerId,
    organization_id: orgId,
    full_name: input.owner_full_name,
    role: 'owner',
    is_active: true,
  })

  if (profileError) {
    console.error('[createOrganization] profile insert failed', { orgId, ownerId, error: profileError })
    // Compensate: delete invited user + org
    await db.auth.admin.deleteUser(ownerId)
    await db.from('organizations').delete().eq('id', orgId)
    return { success: false, error: t('admin.errors.createProfileFailed') }
  }

  if (!(await provisionProgressiveSetup(db, orgId, ownerId))) {
    await db.auth.admin.deleteUser(ownerId)
    await db.from('organizations').delete().eq('id', orgId)
    return { success: false, error: t('admin.errors.createOrgFailed') }
  }

  console.info('[createOrganization] success', { orgId, ownerId, ownerEmail: input.owner_email })
  return { success: true, orgId }
}
