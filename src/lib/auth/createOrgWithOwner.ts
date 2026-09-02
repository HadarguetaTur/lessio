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

import { trackEvent } from '@/lib/tracking/events'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { syncOrgHolidays } from '@/lib/holidays/syncOrgHolidays'
import { TRIAL_DAYS } from '@/lib/saas/subscriptions'
import { z } from 'zod'

export type SignupInput = {
  org_name: string
  full_name: string
  email: string
  password: string
}

export type GoogleSignupInput = {
  org_name: string
  full_name: string
  userId: string
}

export function buildSignupSchema(t: (key: string) => string) {
  return z.object({
    org_name: z.string().min(2, t('orgNameMin')),
    full_name: z.string().min(2, t('fullNameMin')),
    email: z.string().email(t('emailInvalid')),
    password: z.string().min(6, t('passwordMin')),
  })
}

export type SignupFlowServerErrors = {
  emailTaken: string
  accountFailed: string
  orgFailed: string
  profileFailed: string
}

export type SignupResult =
  | { success: true; orgId: string; userId: string }
  | { success: false; error: string }

export async function provisionProgressiveSetup(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  userId: string,
  /** Identity and origin for the conversion events. Optional so a caller that
   *  has neither still provisions correctly. */
  signal?: { email?: string | null; visitorId?: string | null }
): Promise<boolean> {
  const { data: plan } = await db
    .from('saas_plans')
    .select('id')
    .eq('name', 'free')
    .eq('is_active', true)
    .maybeSingle()
  if (!plan) return false

  const now = new Date()
  const trialEnds = new Date(now)
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS)

  const [{ error: teacherError }, { error: subscriptionError }] = await Promise.all([
    db.from('teachers').insert({ organization_id: orgId, profile_id: userId, is_active: true }),
    db.from('organization_subscriptions').upsert(
      {
        organization_id: orgId,
        plan_id: plan.id,
        status: 'trial',
        billing_interval: 'monthly',
        trial_ends_at: trialEnds.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: trialEnds.toISOString(),
      },
      { onConflict: 'organization_id' }
    ),
  ])

  // Per /docs/sprint-34-scope.md § C, step 4. Fire-and-forget: a tracking
  // outage must never fail a signup, and trackEvent swallows its own errors
  // into the tracking_events log where an operator can see and retry them.
  for (const event of ['CompleteRegistration', 'StartTrial'] as const) {
    void trackEvent({
      event,
      organizationId: orgId,
      visitorId: signal?.visitorId ?? null,
      email: signal?.email ?? null,
    })
  }

  if (teacherError || subscriptionError) {
    console.error('[createOrgWithOwner] initial product setup failed', {
      orgId,
      teacherError,
      subscriptionError,
    })
    return false
  }
  return true
}

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
  input: SignupInput,
  errors: SignupFlowServerErrors,
  /**
   * First/last marketing touch captured by the proxy, if any.
   * Per /docs/sprint-34-scope.md § מנוע המדידה, step 4 — this is the moment a
   * click stops being anonymous, and the only chance to record where it came
   * from. Optional so every existing caller and test keeps working.
   */
  attribution?: { attribution: Record<string, unknown> | null; visitorId: string | null }
): Promise<SignupResult> {
  const db = createServiceRoleClient()

  // Step 1 — create auth user
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: false,
    user_metadata: { full_name: input.full_name },
  })

  if (authError || !authData?.user) {
    const msg = authError?.message ?? ''
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return { success: false, error: errors.emailTaken }
    }
    console.error('[createOrgWithOwner] auth signup failed', { error: authError })
    return { success: false, error: errors.accountFailed }
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
      onboarding_completed: true,
      attribution: attribution?.attribution ?? null,
      attribution_visitor_id: attribution?.visitorId ?? null,
    })
    .select('id')
    .single()

  if (orgError || !org) {
    console.error('[createOrgWithOwner] org insert failed', { error: orgError })
    await db.auth.admin.deleteUser(userId)
    return { success: false, error: errors.orgFailed }
  }

  const orgId = org.id

  // Step 4 — default cancellation policy
  await db.from('cancellation_policies').insert({
    organization_id: orgId,
    notice_hours_full: 24,
    notice_hours_partial: 2,
    partial_charge_percent: 50,
  })

  // Step 4b — seed upcoming Jewish holidays (non-fatal: signup must not fail on this)
  try {
    await syncOrgHolidays(db, orgId)
  } catch (e) {
    console.error('[createOrgWithOwner] holiday seed failed', { orgId, error: e })
  }

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
    return { success: false, error: errors.profileFailed }
  }

  if (
    !(await provisionProgressiveSetup(db, orgId, userId, {
      email: input.email,
      visitorId: attribution?.visitorId ?? null,
    }))
  ) {
    await db.auth.admin.deleteUser(userId)
    await db.from('organizations').delete().eq('id', orgId)
    return { success: false, error: errors.orgFailed }
  }

  console.info('[createOrgWithOwner] success', { orgId, userId, email: input.email })
  return { success: true, orgId, userId }
}

/**
 * Creates an org + owner profile for a user who was already created via Google OAuth.
 * Skips auth user creation — the user already exists in Supabase Auth.
 */
export async function createOrgForExistingUser(
  input: GoogleSignupInput,
  errors: Omit<SignupFlowServerErrors, 'emailTaken' | 'accountFailed'>
): Promise<SignupResult> {
  const db = createServiceRoleClient()
  const { userId, org_name, full_name } = input

  const slug = await uniqueSlug(db, toSlug(org_name))

  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert({
      name: org_name,
      slug,
      timezone: 'Asia/Jerusalem',
      break_duration_minutes: 0,
      min_booking_notice_hours: 0,
      billing_mode: 'monthly',
      onboarding_completed: true,
    })
    .select('id')
    .single()

  if (orgError || !org) {
    console.error('[createOrgForExistingUser] org insert failed', { error: orgError })
    return { success: false, error: errors.orgFailed }
  }

  const orgId = org.id

  await db.from('cancellation_policies').insert({
    organization_id: orgId,
    notice_hours_full: 24,
    notice_hours_partial: 2,
    partial_charge_percent: 50,
  })

  // Seed upcoming Jewish holidays (non-fatal: signup must not fail on this)
  try {
    await syncOrgHolidays(db, orgId)
  } catch (e) {
    console.error('[createOrgForExistingUser] holiday seed failed', { orgId, error: e })
  }

  const { error: profileError } = await db.from('profiles').insert({
    id: userId,
    organization_id: orgId,
    full_name,
    role: 'owner',
    is_active: true,
  })

  if (profileError) {
    console.error('[createOrgForExistingUser] profile insert failed', { orgId, userId, error: profileError })
    await db.from('organizations').delete().eq('id', orgId)
    return { success: false, error: errors.profileFailed }
  }

  // No email or visitor id here: GoogleSignupInput carries neither, and the
  // OAuth round trip has already left our origin. The events still fire with
  // the org id — only Meta's match quality is weaker on this path.
  if (!(await provisionProgressiveSetup(db, orgId, userId))) {
    await db.from('organizations').delete().eq('id', orgId)
    return { success: false, error: errors.orgFailed }
  }

  console.info('[createOrgForExistingUser] success', { orgId, userId })
  return { success: true, orgId, userId }
}
