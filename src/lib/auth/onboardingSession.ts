import { createClient } from '@/lib/supabase/server'

export type OnboardingSession = {
  userId: string
  orgId: string
  role: string
}

/** Session for onboarding server actions — owner/admin/teacher/org users only. */
export async function getOnboardingSession(): Promise<OnboardingSession> {
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
  if (!profile?.organization_id) throw new Error('No profile')

  return {
    userId: user.id,
    orgId: profile.organization_id as string,
    role: profile.role,
  }
}

/** Owner-only session (SaaS plan actions). */
export async function getOwnerOnboardingSession(): Promise<{ userId: string; orgId: string }> {
  const { userId, orgId, role } = await getOnboardingSession()
  if (role !== 'owner') throw new Error('Owner only')
  return { userId, orgId }
}
