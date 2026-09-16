import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { AuthNotePage } from '@/components/auth/AuthNotePage'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { ResetPasswordForm } from './ResetPasswordForm'

async function ResetPasswordNote() {
  const t = await getTranslations('auth.resetPassword')

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
      <ResetPasswordForm />
    </AuthNotePage>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthSplitShell>
      <ResetPasswordNote />
    </AuthSplitShell>
  )
}
