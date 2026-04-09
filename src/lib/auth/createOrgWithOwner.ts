/**
 * Self-serve org + owner creation.
 * Called from the /signup server action when a user registers themselves.
 *
 * Steps:
 *  1. Sign up via Supabase Auth
 *  2. Generate unique slug
 *  3. Insert organizations row (onboarding_completed = false)
 *  4. Insert default cancellation_policies row
 *  5. Insert profiles row (role = 'owner')
 *
 * Compensating deletes on failure (same pattern as superadmin createOrganization).
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'

export const SignupSchema = z.object({
  org_name: z.string().min(2, 'שם הארגון חייב להכיל לפחות 2 תווים'),
  full_name: z.string().min(2, 'שם מלא חייב להכיל לפחות 2 תווים'),
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(6, 'סיסמה חייבת להכיל לפחות 6 תווים'),
})

export type SignupInput = z.infer<typeof SignupSchema>

export type SignupResult =
  | { success: true; orgId: string; userId: string }
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

async function uniqueSlug(
  db: ReturnType<typeof createServiceRoleClient>,
  base: string
): Promise<string> {
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

export async function createOrgWithOwner(
  input: SignupInput
): Promise<SignupResult> {
  const db = createServiceRoleClient()

  // Step 1 — create auth user
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
  })

  if (authError || !authData?.user) {
    const msg = authError?.message ?? ''
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return { success: false, error: 'כתובת אימייל זו כבר רשומה במערכת' }
    }
    console.error('[createOrgWithOwner] auth signup failed', { error: authError })
    return { success: false, error: 'שגיאה ביצירת החשבון. נסה שוב.' }
  }

  const userId = authData.user.id

  // Step 2 — slug
  const slug = await uniqueSlug(db, toSlug(input.org_name))

  // Step 3 — insert org
  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert({
      name: input.org_name,
      slug,
      timezone: 'Asia/Jerusalem',
      break_duration_minutes: 0,
      min_booking_notice_hours: 0,
      billing_mode: 'monthly',
      onboarding_completed: false,
    })
    .select('id')
    .single()

  if (orgError || !org) {
    console.error('[createOrgWithOwner] org insert failed', { error: orgError })
    await db.auth.admin.deleteUser(userId)
    return { success: false, error: 'שגיאה ביצירת הארגון. נסה שוב.' }
  }

  const orgId = org.id

  // Step 4 — default cancellation policy
  await db.from('cancellation_policies').insert({
    organization_id: orgId,
    notice_hours_full: 24,
    notice_hours_partial: 2,
    partial_charge_percent: 50,
  })

  // Step 5 — insert profile
  const { error: profileError } = await db.from('profiles').insert({
    id: userId,
    organization_id: orgId,
    full_name: input.full_name,
    role: 'owner',
    is_active: true,
  })

  if (profileError) {
    console.error('[createOrgWithOwner] profile insert failed', {
      orgId,
      userId,
      error: profileError,
    })
    await db.auth.admin.deleteUser(userId)
    await db.from('organizations').delete().eq('id', orgId)
    return { success: false, error: 'יצירת הפרופיל נכשלה. נסה שוב.' }
  }

  console.info('[createOrgWithOwner] success', { orgId, userId, email: input.email })
  return { success: true, orgId, userId }
}
