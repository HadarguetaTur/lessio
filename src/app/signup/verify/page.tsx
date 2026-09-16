import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { AuthNotePage } from '@/components/auth/AuthNotePage'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { VerifyEmailCard } from './VerifyEmailCard'

interface Props {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { email } = await searchParams
  if (!email) redirect('/signup')

  const t = await getTranslations('auth.signup.verify')

  return (
    <AuthSplitShell>
      <AuthNotePage
        title={t('title')}
        footer={
          <p>
            <Link href="/login" className="link-rule">
              {t('backToLogin')}
            </Link>
          </p>
        }
      >
        <VerifyEmailCard email={decodeURIComponent(email)} />
      </AuthNotePage>
    </AuthSplitShell>
  )
}
