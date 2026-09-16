import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { AuthNotePage } from '@/components/auth/AuthNotePage'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { ForgotPasswordForm } from './ForgotPasswordForm'

async function ForgotPasswordNote() {
  const t = await getTranslations('auth.forgotPassword')

  return (
    <AuthNotePage
      title={t('title')}
      footer={
        <p>
          {t('remember')}{' '}
          <Link href="/login" className="link-rule">
            {t('loginLink')}
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthNotePage>
  )
}

export default function ForgotPasswordPage() {
  return (
    <AuthSplitShell>
      <ForgotPasswordNote />
    </AuthSplitShell>
  )
}
