import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LoginForm } from './LoginForm'

/**
 * Portal login page — two steps:
 *   1. Phone entry → requestOtpAction → redirects to ?step=verify&phone=...
 *   2. OTP entry  → verifyOtpAction  → sets cookie + redirects to /home
 *
 * Per /docs/sprint-13-scope.md § Story 6.
 */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ step?: string; phone?: string; resend?: string }>
}) {
  const { orgId } = await params
  const { step, phone } = await searchParams

  // The business name appears in the consent line under the phone step — a
  // parent agreeing to receive messages has to be told who will be sending them.
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()

  return <LoginForm orgId={orgId} step={step} phone={phone} orgName={(org?.name as string | null) ?? ''} />
}
