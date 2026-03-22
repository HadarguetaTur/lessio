import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface UserSession {
  userId: string
  orgId: string
  role: string
  fullName: string
}

/**
 * Returns the current authenticated user's session including org_id and role.
 * Redirects to /login if not authenticated or profile not found.
 * Use in Server Components and Server Actions only.
 */
export async function getSession(): Promise<UserSession> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return {
    userId: user.id,
    orgId: profile.organization_id,
    role: profile.role,
    fullName: profile.full_name,
  }
}
