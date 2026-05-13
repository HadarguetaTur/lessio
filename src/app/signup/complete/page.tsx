import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { AuthEntryColumn } from '@/components/auth/AuthEntryColumn'
import { CompleteSignupForm } from './CompleteSignupForm'

export default async function SignupCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // No session — back to login
  if (!user) redirect('/login')

  // Already has a profile — already completed signup
  const db = createServiceRoleClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (profile) redirect('/dashboard')

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? ''
  const email = user.email ?? ''

  const t = await getTranslations('auth.signupComplete')

  return (
    <AuthSplitShell>
      <AuthEntryColumn
        title={t('title')}
        card={<CompleteSignupForm defaultFullName={fullName} email={email} />}
      />
    </AuthSplitShell>
  )
}
