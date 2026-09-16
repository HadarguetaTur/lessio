import Link from 'next/link'

import { getTranslations } from 'next-intl/server'

import { AuthNotePage } from '@/components/auth/AuthNotePage'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { LoginSocialButtons } from '@/components/auth/LoginSocialButtons'

import { SignupForm } from './SignupForm'

async function SignupNote() {
  const t = await getTranslations('auth.signup')

  return (
    <AuthNotePage
      title={t('title')}
      after={
        <div className="grid gap-6">
          <p className="divider-pen">
            <span>{t('divider')}</span>
          </p>
          <LoginSocialButtons variant="signup" />
        </div>
      }
      footer={
        <p>
          {t('hasAccount')}{' '}
          <Link href="/login" className="link-rule">
            {t('loginLink')}
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthNotePage>
  )
}

export default function SignupPage() {
  return (
    <AuthSplitShell>
      <SignupNote />
    </AuthSplitShell>
  )
}
