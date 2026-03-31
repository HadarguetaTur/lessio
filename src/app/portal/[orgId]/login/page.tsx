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
  searchParams: Promise<{ step?: string; phone?: string }>
}) {
  const { orgId } = await params
  const { step, phone } = await searchParams

  return <LoginForm orgId={orgId} step={step} phone={phone} />
}
