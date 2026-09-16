import Link from 'next/link'

import { getTranslations } from 'next-intl/server'

import { AuthNotePage } from '@/components/auth/AuthNotePage'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { LoginSocialButtons } from '@/components/auth/LoginSocialButtons'
import { LoginForm } from './LoginForm'

async function LoginNote() {
  const t = await getTranslations('auth.login')

  return (
    <AuthNotePage
      title={t('title')}
      after={
        <div className="grid gap-6">
          <p className="divider-pen">
            <span>{t('divider')}</span>
          </p>
          <LoginSocialButtons />
        </div>
      }
      footer={
        <p>
          {t('noAccount')}{' '}
          <Link href="/signup" className="link-rule">
            {t('signupLink')}
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthNotePage>
  )
}

export default function LoginPage() {
  return (
    <AuthSplitShell>
      <LoginNote />
    </AuthSplitShell>
  )
}
